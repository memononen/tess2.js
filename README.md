tess2.js
========

The tess2.js library performs polygon boolean operations and tesselation to triangles and convex polygons. It is a port of libtess2, which is turn is a cleaned up version of the stock GLU tesselator. The original code was written Eric Veach in 1994. The greatest thing about tess2.js is that it handles all kinds of input like self-intersecting polygons or any nomber of holes and contours.

Installation:
```npm install tess2 --save```

Example use:
```javascript
var Tess2 = require('tess2');

// Define input
var ca = [0,0, 10,0, 5,10];
var cb = [0,2, 10,2, 10,6, 0,6];
var contours = [ca,cb];

// Tesselate
var res = Tess2.tesselate({
	contours: contours,
	windingRule: Tess2.WINDING_ODD,
	elementType: Tess2.POLYGONS,
	polySize: 3,
	vertexSize: 2
});

// Use vertices
for (var i = 0; i < res.vertices.length; i += 2) {
	drawVertex(res.vertices[i], res.vertices[i+1]);
}
// Use triangles
for (var i = 0; i < res.elements.length; i += 3) {
	var a = res.elements[i], b = res.elements[i+1], c = res.elements[i+2];
	drawTriangle(res.vertices[a*2], res.vertices[a*2+1],
		res.vertices[b*2], res.vertices[b*2+1],
		res.vertices[c*2], res.vertices[c*2+1]);
}
```

Further reading:
http://www.glprogramming.com/red/chapter11.html

## Browser / AMD / etc
 
The `build/tess2.js` works with RequireJS, CommonJS, or "no-module" patterns, like a simple script tag:

```html
<script src="tess2.js"></script>
<script>
var res = Tess2.tesselate({ ... });

//same as above...
</script>
```

## Building

To build the UMD file, enter the following:

```npm run build```