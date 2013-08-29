// Example based on poly2tri.js demo code.

"use strict";

var contours = [];
var bounds = [10000000,10000000,-10000000,-10000000];
var offset = [0, 0];
var scale = 1.0;
var tess = null;

function clearData() {
	$(".info").css('visibility', 'hidden');
    $("textarea").val("");

	offset = [0,0];
	scale = 1.0;
	contours = [];
	bounds = [10000000,10000000,-10000000,-10000000];
	tess = null;
}

function parsePoints(str) {
	var floats = str.split(/[^-eE\.\d]+/).filter(function(val) {
		return val;
	}).map(parseFloat);
	return floats;
}

function polygonBounds(points, bounds) {
	for (var i = 0; i < points.length; i += 2) {
		var x = points[i+0];
		var y = points[i+1];
		bounds[0] = Math.min(bounds[0], x);
		bounds[1] = Math.min(bounds[1], y);
		bounds[2] = Math.max(bounds[2], x);
		bounds[3] = Math.max(bounds[3], y);
	}
}

function polygonPath(ctx, points) {
	ctx.beginPath();
	for (var i = 0; i < points.length; i += 2) {
		var x = points[i+0];
		var y = points[i+1];
		if (i === 0)
			ctx.moveTo(x, y);
		else
			ctx.lineTo(x, y);
	}
	ctx.closePath();
}

function polygonPoints(ctx, points, size) {
	ctx.beginPath();
	for (var i = 0; i < points.length; i += 2) {
		var x = points[i+0];
		var y = points[i+1];
		ctx.arc(x, y, size, 0, 2 * Math.PI, false);
	}
	ctx.closePath();
}

function triangulate() {

	contours = [];
	bounds = [10000000,10000000,-10000000,-10000000];

	// parse holes
	var npts = 0;
	$("textarea#poly_contours").val().split(/\n\s*\n/).forEach(function(val) {
		var cont = parsePoints(val);
		if (cont.length > 0) {
			polygonBounds(cont, bounds);
			contours.push(cont);
			npts += cont.length/2;
		}
	});
	$("#contours_size").text(contours.length);
	$("#contours_points").text(npts);

	var $canvas = $('#canvas');
	var ctx = $canvas[0].getContext('2d');
	ctx.canvas.width = $canvas.width();
	ctx.canvas.height = $canvas.height();
	var xscale = (ctx.canvas.width * 0.8) / (bounds[2] - bounds[0]);
	var yscale = (ctx.canvas.height * 0.8) / (bounds[3] - bounds[1]);
	scale = Math.min(xscale, yscale);

	var t0 = window.performance.now();

	tess = Tess2.tesselate({
		contours: contours,
		windingRule: Tess2.WINDING_ODD,
		elementType: Tess2.POLYGONS,
		polySize: 3,
		vertexSize: 2,
		normal: [0,0,1]
	});

	var t1 = window.performance.now();

	$("#tess_time").text((t1-t0).toFixed(4));
	$("#triangles_size").text(tess.elementCount);
}

function draw() {
	var error_points;

	var $canvas = $('#canvas');
	var ctx = $canvas[0].getContext('2d');
	ctx.canvas.width = $canvas.width();
	ctx.canvas.height = $canvas.height();

	// clear the canvas
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	$(".info").css('visibility', 'visible');

	// auto scale / translate
	var cx = (bounds[0]+bounds[2])/2;
	var cy = (bounds[1]+bounds[3])/2;

	ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);
	ctx.scale(scale, scale);
	ctx.translate(-offset[0], -offset[1]);
	ctx.translate(-cx, -cy);

	var linescale = 1 / scale;

	// draw result
	ctx.lineWidth = linescale;
//	ctx.fillStyle = TRIANGLE_FILL_STYLE;
//	ctx.strokeStyle = TRIANGLE_STROKE_STYLE;
	ctx.setLineDash(null);

/*    triangles.forEach(function(t) {
		polygonPath(ctx, [t.getPoint(0), t.getPoint(1), t.getPoint(2)]);
		ctx.fill();
		ctx.stroke();
	});*/

	if (tess !== null) {

		ctx.strokeStyle = "rgba(0,192,255, 0.6)";
		ctx.fillStyle = "rgba(0,192,255, 0.2)";
		ctx.lineWidth = linescale;

		for (var i = 0; i < tess.elements.length; i += 3) {
			var ia = tess.elements[i+0];
			var ib = tess.elements[i+1];
			var ic = tess.elements[i+2];
			ctx.beginPath();
			ctx.moveTo(tess.vertices[ia*2+0], tess.vertices[ia*2+1]);
			ctx.lineTo(tess.vertices[ib*2+0], tess.vertices[ib*2+1]);
			ctx.lineTo(tess.vertices[ic*2+0], tess.vertices[ic*2+1]);
			ctx.closePath();
			ctx.stroke();
			ctx.fill();
		}

		if (tess.mesh) {
			ctx.fillStyle = "rgba(0,192,255, 0.8)";
			var vHead = tess.mesh.vHead;
			for (var v = vHead.next; v !== vHead; v = v.next) {
				ctx.beginPath();
//				ctx.arc(v.coords[0], v.coords[1], linescale*2.0, 0, 2 * Math.PI, false);
				ctx.arc(v.s, v.t, linescale*2.0, 0, 2 * Math.PI, false);
				ctx.fill();
			}

			var eHead = tess.mesh.eHead;
			ctx.strokeStyle = "rgba(0,192,255, 0.8)";
			for (var e = eHead.next; e !== eHead; e = e.next) {
				ctx.beginPath();
//				ctx.moveTo(e.Org.coords[0], e.Org.coords[1]);
//				ctx.lineTo(e.Dst.coords[0], e.Dst.coords[1]);
				ctx.moveTo(e.Org.s, e.Org.t);
				ctx.lineTo(e.Dst.s, e.Dst.t);
				ctx.stroke();
			}
		}

/*	this.vertices = [];
	this.vertexIndices = [];
	this.vertexCount = 0;
	this.elements = [];
	this.elementCount = 0;*/

	}


	// draw constraints
	if ($("#draw_bounds").attr('checked')) {

		// Bounds
		ctx.strokeStyle = "rgba(0,255,0, 0.6)";
		ctx.lineWidth = linescale;
		ctx.setLineDash([5 * linescale, 5 * linescale]);
		ctx.beginPath();
		ctx.moveTo(bounds[0], bounds[1]);
		ctx.lineTo(bounds[2], bounds[1]);
		ctx.lineTo(bounds[2], bounds[3]);
		ctx.lineTo(bounds[0], bounds[3]);
		ctx.lineTo(bounds[0], bounds[1]);
		ctx.stroke();
		ctx.setLineDash(null);

		ctx.beginPath();
		ctx.moveTo(cx-linescale*10, cy);
		ctx.lineTo(cx+linescale*10, cy);
		ctx.moveTo(cx,cy-linescale*10);
		ctx.lineTo(cx,cy+linescale*10);
		ctx.stroke();
	}

	if ($("#draw_input_polys").attr('checked')) {
		// Polygons
		ctx.lineWidth = linescale*1.5;
		ctx.strokeStyle = "rgba(192,32,16, 0.6)";
		ctx.fillStyle = "rgba(192,32,16, 0.6)";
//		ctx.setLineDash([3 * linescale, 2 * linescale]);


		for (var i = 0; i < contours.length; i++) {
			polygonPath(ctx, contours[i]);
			ctx.stroke();
			polygonPoints(ctx, contours[i], linescale*2);
			ctx.fill();
		}

	}

	// highlight errors, if any
/*	if (error_points) {
		ctx.lineWidth = 4 * linescale;
		ctx.fillStyle = ERROR_STYLE;
		error_points.forEach(function(point) {
			ctx.beginPath();
			ctx.arc(point.x, point.y, ctx.lineWidth, 0, 2 * Math.PI, false);
			ctx.closePath();
			ctx.fill();
		});
	}*/
}

$(window).resize(function() {
	draw();
});

$(document).ready(function() {
	var $canvas = $('#canvas');
	var ctx = $canvas[0].getContext('2d');
	ctx.canvas.width = $canvas.width();
	ctx.canvas.height = $canvas.height();

	if (typeof ctx.setLineDash === "undefined") {
		ctx.setLineDash = function(a) {
			ctx.mozDash = a;
		};
	}

	$("#btnTriangulate").click(function() {
		triangulate();
		draw();
	});
	clearData();

	$("#draw_bounds").change(function() {
		draw();
	});

	$("#draw_input_polys").change(function() {
		draw();
	});

	// Load index.json and populate 'preset' menu
	$("#preset").empty().append($('<option>', {
		text: "--Empty--"
	}));
	$.ajax({
		url: "data/index.json",
		dataType: "json",
		success: function(data) {
			var options = [];
			data.forEach(function(group) {
				group.files.filter(function(file) {
					return file.name && file.content;
				}).forEach(function(file) {
					options.push($('<option>', {
						value: file.name,
						text: (file.content || file.name)
					}).data("file", file));
				});
			});
			// Sort before adding
			options.sort(function(a,b) {
				return $(a).text().localeCompare($(b).text());
			}).forEach(function(option) {
				$("#preset").append(option);
			});
			// Load some default data
			$("#preset option[value='star.dat']").attr("selected", "selected");
			$("#preset").change();
		}
	});
	$("#preset").change(function() {
		var file = $("#preset option:selected").data("file") || {};
		function load(filename, next) {
			if (filename) {
				$.ajax({
					url: "data/" + filename,
					success: function(data) {
						if (next) next(data);
					}
				});
			} else {
				if (next) next("");
			}
		}
		clearData();
		var d = "";
		load(file.name, function(data1) {
			d += data1;
			load(file.holes, function(data2) {
				if (data2.length > 0) {
					d += "\n";
					d += data2;
				}
				$("#poly_contours").val(d);
				triangulate();
				draw();
			});
		});
	});

	var panning = false;
	var smouse = [0,0];
	var soffset = [0,0];

	function mousedown( event ) {
		event.preventDefault();
		panning = true;
		smouse[0] = event.clientX;
		smouse[1] = event.clientY;
		soffset[0] = offset[0];
		soffset[1] = offset[1];
		document.addEventListener( 'mousemove', mousemove, false );
		document.addEventListener( 'mouseup', mouseup, false );
	}

	function mousemove( event ) {
		event.preventDefault();
		if ( panning ) {
			var dx = smouse[0] - event.clientX;
			var dy = smouse[1] - event.clientY;
			offset[0] = soffset[0] + dx/scale;
			offset[1] = soffset[1] + dy/scale;
			draw();
		}
	}

	function mouseup( event ) {
		event.preventDefault();
		document.removeEventListener( 'mousemove', mousemove, false );
		document.removeEventListener( 'mouseup', mouseup, false );
	}

	function mousewheel( event ) {
		event.preventDefault();
		var delta = 0;
		if ( event.wheelDelta ) { // WebKit / Opera / Explorer 9
			delta = event.wheelDelta;
		} else if ( event.detail ) { // Firefox
			delta = -event.detail;
		}

		if (delta > 0) {
			scale *= 1.1;
			draw();
		} else if (delta < 0) {
			scale /= 1.1;
			draw();
		}
	};

	var canvas = $canvas[0];
	canvas.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );
	canvas.addEventListener( 'mousedown', mousedown, false );
	canvas.addEventListener( 'mousewheel', mousewheel, false );
	canvas.addEventListener( 'DOMMouseScroll', mousewheel, false ); // firefox

});

