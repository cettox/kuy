var mongo = require('mongodb');
var Job = require('./job.js')

var Kuy = module.exports = function Kuy(options){ 

	this.db = null; //internal reference to mongodb client
	this.mongo_url = options.mongo_url || "localhost:27017";
	this.status = "stopped"; //whether Kuy is working or not, it would change to working if Kuy is working
	this.jobWorkers = {};
	this._mainInterval = null; //reference to main interval, that checks job handler intervals, and health of the system
	this._jobTimeout = null; //reference to job timeOut, that would set to run at next jobs execution time
	this._runEvery = options.runEvery || 1000; //if no options was given run at every 30 secs
	this._batchSize = options.batchSize || 600000;
	this.collectionName = "jobs";

	init(this,options.success || function(){});
};

/*

	@param when, Javascript Date object or timestamp Number
	@param jobName
	@param data

	Schedules a new job to be executed at 'when', to be passed to job named jobName,
	with arbitrary data
*/
Kuy.prototype.schedule = function (when,jobName,data){
	var job = new Job(this,{
		jobName:jobName,
		data:data,
		runAt : when
	});

	job.save(function(){
		console.log("job saved");
	});

}

/*
	Defines a new job worker, with given jobName and job function
	@param jobName String name of the job
	@param fn Function job worker,
	
	overwrites current job, if jobName exists in this.jobWorkers

*/
Kuy.prototype.defineJob = function (jobName, fn){
	this.jobWorkers[jobName] = fn;
}

/*
	Starts the execution of Kuy, it would lock and select first job,

*/
Kuy.prototype.start = function (){
	var self = this;
	console.log("starting Kuy");
	if(this._mainInterval !== null){return console.log("Kuy already running");}

	this._mainInterval = setInterval(function(){
		self.processJobs();

	},this._runEvery);
	console.log("Kuy Started for every "+Math.floor(this._runEvery /1000) +" seconds");
}

/*
	If called, fetches & locks all jobs to be executed within next 10 (or given in options) minutes

*/
Kuy.prototype.processJobs = function(){
	var self = this;
	console.log("processJobs called \nfetching jobs");
	self.getJobs(function(jobs){
		console.log("jobs fetched ",jobs);
		for(var i = 0; i< jobs.length; i++){
			var job = new Job(self,jobs[i]);
			
			var jobName = job.attrs.jobName;
			if(self.jobWorkers[jobName] !== undefined){
				job.work(self.jobWorkers[jobName]);
			}else{
				console.log("JobName is not defined!!! ",jobName);
			}
		}
	});
}

Kuy.prototype.getJobs = function(cb){
	var self = this;
	var db = this.db;
	var collection = db.collection(this.collectionName);

	var timeUpperLimit = new Date().getTime() + this._batchSize;
	//find pending unlocked jobs and proccess them
	console.log("mongo query ",{runAt : {$lt : timeUpperLimit}});
	collection.find({runAt : {$lt : timeUpperLimit},status:"pending", locked:false}).toArray(function(err,jobs){
		if(err){console.log("error on getting jobs "); return}

		cb(jobs);
		//also lock jobs
		self.lockJobs(jobs,function(){
			console.log("Jobs locked");
		});
	});
}

Kuy.prototype.lockJobs = function(jobs,cb){
	var self = this;
	for(var i = 0; i< jobs.length; i++){
		console.log("creating jobs ",jobs[i]);
		var job = new Job(self,jobs[i]);
		job.lock();
	}
}
//private functions
/*
	sets up kuy's mongodb client instance
*/
function init(kuy,callback){
	mongo.MongoClient.connect(kuy.mongo_url,{native_parser:true}, function(err, db){
		kuy.db = db; //store reference to db;
		callback();
	});
}
