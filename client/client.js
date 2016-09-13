var UPDATE_TIME = 50;
var GRAPH_VALNUM = 300; // show only so much on graph before scrolling (and throwing away data from browser)

var socket = io();

// Graph history data:
var voltage_data = [];
var current_data = [];

var date_begin = Date.now();

// Get property from server
function server_prop(type, callback) {
	socket.emit("prop", {
		type: type
	}, callback);
}

var HCS_decplaces = 1;

// ###########
// ## Utils ##
// ###########
function gridster_init() {
	$("#maingrid").gridster({
		widget_margins: [10, 10],
		widget_base_dimensions: [50, 50],
		autogrow_cols: true,
		resize: {
			enabled: true
		},
		min_cols: 1,
		min_rows: 1
	});
}


function downloadData(filename, data) {
    var dl = $("<a>").attr("href", "data:text/plain;charset=utf-8," + encodeURIComponent(data));
    dl.attr("download", filename);
    dl[0].click();
}

// ################
// ## Timed List ##
// ################
var timed_list = [];

// Running iterator
// -1 = not in use, not running
// otherwise, the number specifies the currently active index in timed_list
var tlist_runningit = -1;

// The timeout for to set the next value
var tlist_timeout;

// Re-output timed list
function tlist_update() {
	// Clear list and put header
	$("#timedlist").empty();
	$("#timedlist").append($("<tr>")
		.append($("<th>").append("Duration (s)"))
		.append($("<th>").append("Voltage (V)"))
		.append($("<th>").append("Current (A)"))
	);

	// Put list
	timed_list.forEach(function(t, i) {
		var delbutton = "<input type=\"button\" class=\"tlist_del\" data-listid=" + i + " value=\"⌫\" />";
		var upbutton = "<input type=\"button\" class=\"tlist_up\" data-listid=" + i + " value=\"↑\" />";
		var downbutton = "<input type=\"button\" class=\"tlist_down\" data-listid=" + i + " value=\"↓\" />";
		var runbutton = "<input type=\"button\" class=\"tlist_run\" data-listid=" + i + " value=\"▶\" />";

		$("#timedlist").append($("<tr>")
			.append($("<td>").append(t.dur))
			.append($("<td>").append(t.volt))
			.append($("<td>").append(t.curr))
			.append($("<td>").append(delbutton))
			.append($("<td>").append(upbutton))
			.append($("<td>").append(downbutton))
			.append($("<td>").append(runbutton))
		);
	});

	// Mark active list element
	if (tlist_runningit != -1)
		$($("#timedlist").find("tr")[tlist_runningit + 1]).css("background-color", "#f80");

	// Update callbacks
	$(".tlist_del").click(timedlist_del);
	$(".tlist_up").click(timedlist_up);
	$(".tlist_down").click(timedlist_down);
	$(".tlist_run").click(timedlist_run);

	// Lock UI if running
	if (tlist_runningit != -1) {
		$(".tlist_down").each(function(_, e) {
			$(e).attr("disabled", true);
		});
		$(".tlist_del").each(function(_, e) {
			$(e).attr("disabled", true);
		});
		$(".tlist_up").each(function(_, e) {
			$(e).attr("disabled", true);
		});
	}
}

function timedlist_add() {
	var curr = parseFloat($("#tlist_curr").val());
	var volt = parseFloat($("#tlist_volt").val());
	var dur = parseFloat($("#tlist_dur").val());

	if (curr == NaN || volt == NaN || dur == NaN) {
		alert("You must provide values for current, voltage and duration");
		return;
	}

	timed_list.push({
		curr: curr,
		volt: volt,
		dur: dur
	});
	tlist_update();

	// Scroll to bottom
	$("#timedlist_scroll").scrollTop($("#timedlist_scroll").prop("scrollHeight"));
}

function timedlist_del() {
	timed_list.splice($(this).data("listid"), 1);
	tlist_update();
}

function timedlist_up() {
	var lid = $(this).data("listid");
	if (lid <= 0) return;

	var above = timed_list[lid - 1];
	timed_list[lid - 1] = timed_list[lid];
	timed_list[lid] = above;

	tlist_update();
}

function timedlist_down() {
	var lid = $(this).data("listid");
	if (lid + 1 >= timed_list.length) return;

	var below = timed_list[lid + 1];
	timed_list[lid + 1] = timed_list[lid];
	timed_list[lid] = below;

	tlist_update();
}

function timedlist_playback(lid) {
	tlist_runningit = lid;
	socket.emit("hcs", "VOLTAGE "+timed_list[lid].volt);
	socket.emit("hcs", "CURRENT "+timed_list[lid].curr);
	tlist_update();

	// Scroll to active element
	$("#timedlist_scroll").scrollTop(tlist_runningit * 34 - 10);

	// if this is the last element, stop playback	
	if (lid + 1 >= timed_list.length)
		setTimeout(function() {
			timedlist_stop();
		}, timed_list[lid].dur * 1000);
	else
		tlist_timeout = setTimeout(function() {
			timedlist_playback(lid + 1);
		}, timed_list[lid].dur * 1000);
}

function timedlist_run() {
	timedlist_stop();
	timedlist_playback($(this).data("listid"));
}

function timedlist_stop() {
	clearTimeout(tlist_timeout);
	tlist_runningit = -1;
	tlist_update();
}

// ####################
// ## Export / Import #
// ####################
function exim_exptlist () {
	downloadData("manson_timedlist.json", JSON.stringify(timed_list));
}

function exim_expui () {
	downloadData("manson_ui.json", JSON.stringify($("#maingrid").gridster().data('gridster').serialize()));
}

function exim_imptlist () {
	$("<input type=\"file\" />")
		.click()
		.change(function(e) {
			var reader = new FileReader();

			reader.onload = function(event) {
				console.log('upload', event.target.result);
				timed_list = $.parseJSON(event.target.result);
				tlist_update();
			};

			reader.readAsText(e.target.files[0]);
		});
}

function exim_impui () {
	$("<input type=\"file\" />")
		.click()
		.change(function(e) {
			var reader = new FileReader();

			reader.onload = function(event) {
				var griddat = $.parseJSON(event.target.result);
				$($.find("#maingrid li")).each(function (idx, li) {
					$(li).attr("data-sizex", griddat[idx].size_x);
					$(li).attr("data-sizey", griddat[idx].size_y);
					$(li).attr("data-col", griddat[idx].col);
					$(li).attr("data-row", griddat[idx].row);
				});
			};

			gridster_init();
			reader.readAsText(e.target.files[0]);
		});
}

// ##############
// ## Setup UI ##
// ##############
// Retrieve basic information from the server and apply them
function setup_ui() {
	$("#voltage_control").attr("min", "0.0");
	$("#voltage_control").attr("step", "0.1");
	$("#current_control").attr("min", "0.0");

	server_prop("get_max_volt", function(volt) {
		$("#voltage_control").attr("max", volt);
	});

	server_prop("get_max_curr", function(curr) {
		$("#current_control").attr("max", curr);
	});

	server_prop("get_decimal_places", function(decplaces) {
		HCS_decplaces = decplaces;
		$("#current_control").attr("step", Math.pow(0.1, HCS_decplaces));

		// Store number of decimal places in serialization / deserialization modules
		command_set_decplaces(HCS_decplaces);
	});

	/* 7-segment displays */



	// Setting values
	var volt_set = $("#volt_set");
	var curr_set = $("#curr_set");

	// Actual values
	var volt_actual = $("#volt_actual");
	var curr_actual = $("#curr_actual");

	// Counter values (charge, energy)
	var charge_disp = $("#charge_disp");
	var energy_disp = $("#energy_disp");
	var counter_charge = 0 // (in As)
	var lasttime_current = Date.now()

	// Energy counter class: Tell it current and voltage server replies, it will update
	// itself (witht the display) automatically and calculate the resulting energy flow
	var energy_counter = {
		curr: undefined,
		volt: undefined,
		totalEnergy: 0,
		lasttime: Date.now(),
		getEnergy: function() {
			return this.totalEnergy;
		},
		update: function() {
			if (this.curr !== undefined && this.volt !== undefined) {
				this.totalEnergy += this.volt * this.curr *
					(Date.now() - this.lasttime) / 1000;
				this.lasttime = Date.now();
				this.curr = undefined;
				this.volt = undefined;

				// Convert from Ws to Wh (/ 3600)
				var ener_str = (this.totalEnergy / 3600).toFixed(2).toString();
				while (ener_str.length < 6) ener_str = " " + ener_str;
				energy_disp.text(ener_str);

			}
		},
		setCurrent: function(curr) {
			this.curr = curr;
			this.update();
		},
		setVoltage: function(volt) {
			this.volt = volt;
			this.update();
		}
	}

	var update_properties = function() {

		var update_if_changed = function(element_set,value) {
			var value_str = typeof(value) === "number" ? value.toFixed(2).toString() : value;

			var last = element_set.data('last');
			if ( last && last == value_str ) return 0;

			element_set.text(value_str);

			element_set.data('last', value_str);
			//console.log(value_str,value,element_set);

			return value_str;
		};

		server_prop("get_volt", function(volt) {
			if ( update_if_changed(volt_set, volt) ) {
				setControlVoltage(volt);
			}
		});

		server_prop("get_curr", function(curr) {
			if ( update_if_changed(curr_set, curr) ) {
				setControlCurrent(curr);
			}
		});

		server_prop("get_actual_volt", function(volt) {
			update_if_changed(volt_actual, volt);

			voltage_data.push([(Date.now() - date_begin) / 1000, volt]);

			// Reset flot voltage graph
			var valnum = $("#voltagegraph").data("valnum");
			var data = (voltage_data.length > valnum) ? [voltage_data.slice(voltage_data.length - valnum)] : [voltage_data];

			var voltagegraph = $.plot($("#voltagegraph"), data);

			voltagegraph.draw();
			voltagegraph.setupGrid();

			energy_counter.setVoltage(volt);
		});

		server_prop("get_actual_curr", function(curr) {
			update_if_changed(curr_actual, curr);

			current_data.push([(Date.now() - date_begin) / 1000, curr]);

			// Reset flot current graph
			var valnum = $("#currentgraph").data("valnum");
			var data = (current_data.length > valnum) ? [current_data.slice(current_data.length - valnum)] : [current_data];

			var currentgraph = $.plot($("#currentgraph"), data, { colors: ['#07f'] });

			currentgraph.draw();
			currentgraph.setupGrid();

			// Increase charge count
			var delta_t = (Date.now() - lasttime_current) / 1000;
			lasttime_current = Date.now();
			counter_charge += delta_t * curr;

			// Convert from As to Ah via / 3600, from Ah to mAh (* 1000)
			var charge_str = (counter_charge / 3600 * 1000).toFixed(2).toString();

			while (charge_str.length < 6) charge_str = " " + charge_str;
			//XXXupdate_if_changed(charge_disp, charge_str);
			charge_disp.text(charge_str);

			energy_counter.setCurrent(curr);
		});

		server_prop("get_enable_out", function(enable) {
			$("#toggle_output").attr("status", enable);
		});

		server_prop("get_cvcc", function(cvcc) {
			var el = $("#cvcc_disp").attr("status", cvcc);
			if ( update_if_changed(el, cvcc == "cv" ? "CV" : "CC") ) {
				volt_actual.attr("status", cvcc);
				curr_actual.attr("status", cvcc);
					
			}
		});
	}

	update_properties();
	socket.on("propchange", update_properties);
}

function setControlVoltage(val) {
	var value = parseFloat(val).toFixed(1);
	$("#voltage_control").val(value);
	$("#voltage_control").parent().parent().find(".value").html(value + "V");
}

function setControlCurrent(val) {
	var value = parseFloat(val).toFixed(HCS_decplaces);
	$("#current_control").val(value);
	$("#current_control").parent().parent().find(".value").html(value + "A");
}

// ##########################################
// ## HCS Output (broadcast) --> Modify UI ##
// ##########################################
socket.on("hcs", function(cmd) {
	$("#serial_log").append($("<li>").text(cmd));
	$("#serial_log").scrollTop($("#serial_log").prop("scrollHeight"));
});

socket.on("hcs_answer", function(answer) {
	console.log(answer);
	answer._lines.forEach(function(a) {
		$("#serial_log").append($("<li>").text(a));
		$("#serial_log").scrollTop($("#serial_log").prop("scrollHeight"));
	});
});

// ##############################
// ## UI input --> send to HCS ##
// ##############################
function putserial() {
	socket.emit("hcs", $("#serial_msg").val());
	$("#serial_msg").val("");
}

$(document).ready(function() {
	console.log('ready');
	// Initialize gridster for the grid layout
	gridster_init();

	// Send manual command
	$("#putserial").click(putserial);
	$("#serial_msg").keypress(function(e) {
		if (e.which == 13) putserial();
	});

	// Set number of values in graph
	$(".graph_valnum").val(GRAPH_VALNUM).keypress(function(e) {
		if (e.which == 13)
			$(this).parent().parent().find(".graph").data("valnum",
				parseInt($(this).val()));
	}).each(function(e) {
		// XXX this will set maxwidth of graph on load
		$(this).parent().parent().find(".graph").data("valnum", GRAPH_VALNUM);
	});

	/* --- Timed list --- */
	tlist_update();
	$("#tlist_add").click(timedlist_add);
	$("#tlist_stop").click(timedlist_stop);

	/* --- Export / Import module --- */
	$("#exptlist").click(exim_exptlist);
	$("#imptlist").click(exim_imptlist);
	$("#expui").click(exim_expui);
	$("#impui").click(exim_impui);

	// Set output state
	$("#toggle_output").click(function() {
		// Send toggle-state request to server
		var newstate = $("#toggle_output").attr("status") == "enable" ? 0 : 1;
		//socket.emit("hcs", command_serialize("SOUT", [newstate]));
		socket.emit("hcs", "OUTPUT " + newstate);
	});

	// Voltage slider
	$("#voltage_control").on("input", function() {
		setControlVoltage(parseFloat($("#voltage_control").val()));
	});

	// Current slider
	$("#current_control").on("input", function() {
		setControlCurrent(parseFloat($("#current_control").val()));
	});

	// Update (= send to server + HCS, broadcast) voltage + current values
	$("#controls_update").on("click", function() {
		var voltage = parseFloat($("#voltage_control").val());
		var current = parseFloat($("#current_control").val());

		socket.emit("hcs", "VOLTAGE "+voltage);
		socket.emit("hcs", "CURRENT "+current);
	});

	setup_ui();
	socket.emit("hcs", "MODEL");
});
