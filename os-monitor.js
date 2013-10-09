// OS Monitoring for Node.js

// Copyright (c) 2012-2013 Laurent Fortin
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


var util     = require('util'),
    os       = require('os'),
    events   = require('events'),
    stream   = require('stream'),
    _        = require('underscore'),
    critical = os.cpus().length,
    defaults = {
      delay     : 3000,
      critical1 : critical,
      critical5 : critical,
      critical15: critical,
      freemem   : 0,
      uptime    : 0,
      silent    : false,
      stream    : false
    };

// constructor
var Monitor = function() {
  if(stream.Readable) {
    stream.Readable.call(this, {highWaterMark: 102400});
  } else {
    events.EventEmitter.call(this);
  }

  this._monitorState = {
    running: false,
    streamBuffering: true,
    interval: undefined,
    config: _.clone(defaults)
  };
};

if(stream.Readable) {
  util.inherits(Monitor, stream.Readable);
} else {
  util.inherits(Monitor, events.EventEmitter);
}

Monitor.prototype.version = '0.1.4';


// readable stream implementation requirement
Monitor.prototype._read = function() {
  this._monitorState.streamBuffering = true;
};

Monitor.prototype.sendEvent = function(event, data) {
  // for EventEmitter
  this.emit(event, data);
  // for readable Stream
  if(this._monitorState.config.stream && this._monitorState.streamBuffering) {
    var prettyJSON = os.EOL + JSON.stringify(data, null, 2);
    if( !this.push(new Buffer(prettyJSON)) ) {
      this._monitorState.streamBuffering = false;
    }
  }
};

Monitor.prototype.start = function(options) {

  var self = this;

  self.stop()
      .config(options);

  this._monitorState.interval  = setInterval(function() {
    var info = {
      loadavg  : os.loadavg(),
      uptime   : os.uptime(),
      freemem  : os.freemem(),
      totalmem : os.totalmem()
    },
    config = self._monitorState.config,
    freemem  = (config.freemem < 1) ? config.freemem * info.totalmem : config.freemem;

    if(!config.silent) {
      self.sendEvent('monitor', _.extend({type: 'monitor'}, info));
    }
    if(info.loadavg[0] > config.critical1) {
      self.sendEvent('loadavg1', _.extend({type: 'loadavg1'}, info));
    }
    if(info.loadavg[1] > config.critical5) {
      self.sendEvent('loadavg5', _.extend({type: 'loadavg5'}, info));
    }
    if(info.loadavg[2] > config.critical15) {
      self.sendEvent('loadavg15', _.extend({type: 'loadavg15'}, info));
    }
    if(info.freemem < freemem) {
      self.sendEvent('freemem', _.extend({type: 'freemem'}, info));
    }
    if(Number(config.uptime) && info.uptime > Number(config.uptime)) {
      self.sendEvent('uptime', _.extend({type: 'uptime'}, info));
    }
  }, this._monitorState.config.delay);

  if(!self.isRunning()) {
    this._monitorState.running = true;
    self.sendEvent('start', {type: 'start'});
  }

  return self;
};

Monitor.prototype.stop = function() {

  clearInterval(this._monitorState.interval);

  if(this.isRunning()) {
    this._monitorState.running = false;
    this.sendEvent('stop', {type: 'stop'});
  }

  return this;
};

Monitor.prototype.config = function(options) {

  if(_.isObject(options)) {
    _.extend(this._monitorState.config, options);
    this.sendEvent('config', {type: 'config', options: _.clone(options)});
  }

  return this._monitorState.config;
};

Monitor.prototype.isRunning = function() {
  return !!this._monitorState.running;
};

Monitor.prototype.throttle = function(event, handler, wait) {
  var self     = this,
      _handler = _.wrap(handler, function(fn) {
                   if(self.isRunning()) {
                     fn.apply(this, _.toArray(arguments).slice(1));
                   }
                 });
  return self.on.call(self, event, _.throttle(_handler, wait || this._monitorState.config.throttle));
};

// deprecated stuff
Monitor.prototype.setConfig = util.deprecate(Monitor.prototype.config);

// expose OS module
Monitor.prototype.os = os;

// expose Underscore
Monitor.prototype._ = _;

// create object
var Osm = new Monitor();

// expose main class
Osm.Monitor = Monitor;

module.exports = Osm;

