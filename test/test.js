// Example based on poly2tri.js demo code.

"use strict";

var contours = [];
var bounds = [10000000,10000000,-10000000,-10000000];
var offset = [0, 0];
var scale = 1.0;
var tess = null;
var windingRule = Tess2.WINDING_ODD;
var polygonSize = 3;
var elementType = Tess2.POLYGONS;

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

function polygonArrows(ctx, points, size) {
	ctx.beginPath();
	var d = 0, dx = 0, dy = 0;
	var px = points[points.length-2];
	var py = points[points.length-1];
	for (var i = 0; i < points.length; i += 2) {
		var x = points[i+0];
		var y = points[i+1];
		dx = x - px;
		dy = y - py;
		d = Math.sqrt(dx*dx + dy*dy);
		if (d > 0) {
			dx /= d; dy /= d;
			ctx.moveTo(x,y);
			ctx.lineTo(x-dx*size-dy*size*0.5, y-dy*size+dx*size*0.5);
			ctx.lineTo(x-dx*size+dy*size*0.5, y-dy*size-dx*size*0.5);
		}
		px = x;
		py = y;
	}
	ctx.moveTo(points[0], points[1]);
	ctx.arc(points[0], points[1], size*0.5, 0, 2 * Math.PI, false);
}

function polyCenter(off, elements, vertices, polygonSize) {
	var cx = 0, cy = 0, cn = 0;
	for (var i = 0; i < polygonSize; i++) {
		var idx = elements[off+i];
		if (idx == -1) break;
		cx += vertices[idx*2+0];
		cy += vertices[idx*2+1];
		cn++;
	}
	return [cx/cn, cy/cn];
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

	switch($("#winding_rule option:selected").attr("value")) {
		case 'odd': windingRule = Tess2.WINDING_ODD; break;
		case 'nonzero': windingRule = Tess2.WINDING_NONZERO; break;
		case 'positive': windingRule = Tess2.WINDING_POSITIVE; break;
		case 'negative': windingRule = Tess2.WINDING_NEGATIVE; break;
		case 'absgeqtwo': windingRule = Tess2.WINDING_ABS_GEQ_TWO; break;
	}

	switch($("#element_type option:selected").attr("value")) {
		case 'polygons': elementType = Tess2.POLYGONS; break;
		case 'connected_polygons': elementType = Tess2.CONNECTED_POLYGONS; break;
		case 'boundary_contours': elementType = Tess2.BOUNDARY_CONTOURS; break;
	}

	switch($("#polygon_size option:selected").attr("value")) {
		case '3': polygonSize = 3; break;
		case '4': polygonSize = 4; break;
		case '6': polygonSize = 6; break;
		case '10': polygonSize = 10; break;
		case '16': polygonSize = 16; break;
	}

	tess = Tess2.tesselate({
		contours: contours,
		windingRule: windingRule, //Tess2.WINDING_ODD,
		elementType: elementType, //Tess2.POLYGONS,
		polySize: polygonSize, //3,
		vertexSize: 2
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
	ctx.scale(scale, -scale); // set origo at bottom-left.
	ctx.translate(-offset[0], -offset[1]);
	ctx.translate(-cx, -cy);

	var linescale = 1 / scale;

	// draw result
	ctx.lineWidth = linescale;
//	ctx.fillStyle = TRIANGLE_FILL_STYLE;
//	ctx.strokeStyle = TRIANGLE_STROKE_STYLE;
	ctx.setLineDash([]);


	if (tess !== null) {

		ctx.strokeStyle = "rgba(0,192,255, 0.6)";
		ctx.fillStyle = "rgba(0,192,255, 0.2)";
		ctx.lineWidth = linescale;

		if (elementType === Tess2.POLYGONS) {
			// Draw polygons
			for (var i = 0; i < tess.elements.length; i += polygonSize) {
				ctx.beginPath();
				for (var j = 0; j < polygonSize; j++) {
					var idx = tess.elements[i+j];
					if (idx == -1) continue;
					if (j === 0)
						ctx.moveTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
					else
						ctx.lineTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
				}
				ctx.closePath();
				ctx.stroke();
				ctx.fill();
			}
		}
		if (elementType === Tess2.CONNECTED_POLYGONS) {
			// Draw polygons
			for (var i = 0; i < tess.elements.length; i += polygonSize*2) {
				ctx.beginPath();
				for (var j = 0; j < polygonSize; j++) {
					var idx = tess.elements[i+j];
					if (idx == -1) continue;
					if (j === 0)
						ctx.moveTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
					else
						ctx.lineTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
				}
				ctx.closePath();
				ctx.stroke();
				ctx.fill();
			}
			// Draw connections
			ctx.strokeStyle = "rgba(0,0,0, 0.6)";
			for (var i = 0; i < tess.elements.length; i += polygonSize*2) {
				var ci = polyCenter(i, tess.elements, tess.vertices, polygonSize);
				ctx.beginPath();
				ctx.moveTo(ci[0]-linescale*3,ci[1]);
				ctx.lineTo(ci[0]+linescale*3,ci[1]);
				ctx.moveTo(ci[0],ci[1]-linescale*3);
				ctx.lineTo(ci[0],ci[1]+linescale*3);

				for (var j = 0; j < polygonSize; j++) {
					var idx = tess.elements[i+j]; // vertex id
					var nei = tess.elements[i+j+polygonSize]; // element id
					if (nei == -1) continue; // no neighbour, skip
					if (nei < i/(polygonSize*2)) continue; // draw only in one direction
					var nidx = ((j+1) == polygonSize || tess.elements[i+j+1] == -1) ? tess.elements[i+0] : tess.elements[i+j+1];
					var cn = polyCenter(nei*polygonSize*2, tess.elements, tess.vertices, polygonSize);
					var dx = cn[0] - ci[0];
					var dy = cn[1] - ci[1];
					ctx.moveTo(ci[0],ci[1]);
					ctx.quadraticCurveTo(ci[0]+dx*0.5+dy*0.3,ci[1]+dy*0.5-dx*0.3, cn[0],cn[1]);
				}
				ctx.stroke();
			}
		}
		if (elementType === Tess2.BOUNDARY_CONTOURS) {
			// Draw polygons
			for (var i = 0; i < tess.elements.length; i += 2) {
				ctx.beginPath();
				var start = tess.elements[i+0];
				var count = tess.elements[i+1];
				for (var j = 0; j < count; j++) {
					var idx = start+j;
					if (j === 0)
						ctx.moveTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
					else
						ctx.lineTo(tess.vertices[idx*2+0], tess.vertices[idx*2+1]);
				}
				ctx.closePath();
				ctx.stroke();
				ctx.fill();
			}
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
	}


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
		ctx.setLineDash([]);

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
			polygonArrows(ctx, contours[i], linescale*6);
//			polygonPoints(ctx, contours[i], linescale*2);
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

	$("#winding_rule").change(function() {
		triangulate();
		draw();
	});

	$("#element_type").change(function() {
		triangulate();
		draw();
	});

	$("#polygon_size").change(function() {
		triangulate();
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
					return file.name; // && file.content;
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
			$("#preset option[value='glu_winding.dat']").attr("selected", "selected");
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
			offset[1] = soffset[1] + dy/-scale;
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

