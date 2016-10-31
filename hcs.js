/* Tiny abstraction layer SerialPort <--> Manson HCS */

var POP_LONG_QUEUE = true; // if the message queue is too long, pop old messages
var POP_QUEUE_MAXLEN = 30; // max. length for POP_LONG_QUEUE

var serial = require("serialport");

exports.ready = false;

exports.open = function(port, baud, callback) {
	// Serial port input callback
	var HCS_callback;

	// Answers from Manson HCS, multiple lines
	var HCS_answer = Array();
	var HCS_obj = Object();

	// Manson HCS is ready to accept new commands (has answered with "OK")
	var HCS_ready = true;
	var HCS_last_cmd = '';

	// Store commands in a queue if HCS is not ready
	var HCS_queue = Array();

	// Open the serial port
	var serport = new serial(port, {
		autoOpen: false,
		baudrate: baud,
		parser: serial.parsers.readline("\r")
	});

	// Get properties
	serport.open(function(error) {
		if (error) {
			console.log(port + " could not be opened, exiting.");
			console.log("Make sure you have the permission to open the port " + "and that it exists.");
			process.exit(1);
		}

		console.log(port + " opened succesfully!");
		exports.ready = true;

		// Collect data from the HCS and execute the callback if the answer was "OK"
		serport.on("data", function(data) {
			//console.log("<< %j", data);
			data = data.replace("\n","");

			v = data.split(/: /);
			HCS_obj[v[0]] = v[1];
			//console.log("# HCS_obj = %j", HCS_obj);


			HCS_answer.push(data);
			if (data == "OK" || data == "DONE") {
				//console.log("# HCS_answer = %j", HCS_answer, HCS_callback);
				HCS_obj['_lines'] = HCS_answer;
				if (HCS_callback) HCS_callback(HCS_obj);
				HCS_answer = [];
				HCS_ready = true;
			}
		});

		function command(cmd, callback) {
			if (!HCS_ready) {
				if ( HCS_last_cmd == cmd ) {
					console.log('ignore queue for',cmd);
				} else {
					HCS_queue.push({
						cmd: cmd,
						callback: callback
					});
					console.log('HCS_queue = %j', HCS_queue);
				}
			} else {
				HCS_ready = false;
				HCS_last_cmd = cmd;
				cmd += "\r";
				cmd = cmd.replace("\r\r","\r");
				serport.write(cmd);
				console.log(">> %j",cmd);
				HCS_callback = callback;
			}
		}
		exports.command = command;

		// Try to execute pending commands in the queue
		setInterval(function() {
			if (POP_LONG_QUEUE)
				while (HCS_queue.length > POP_QUEUE_MAXLEN) HCS_queue.shift();

			if (HCS_ready && HCS_queue.length > 0) {
				var e = HCS_queue.shift();
				command(e.cmd, e.callback);
			}
		}, 20);

		// Reset HCS_ready every second in case there was a communication error
		setInterval(function() {
			HCS_ready = true;
		}, 1000);

		callback();
	});
}
