

var assert = function(cond) {
	if (!cond) {
		throw "Assertion Failed!";
	}
}


/* The mesh structure is similar in spirit, notation, and operations
* to the "quad-edge" structure (see L. Guibas and J. Stolfi, Primitives
* for the manipulation of general subdivisions and the computation of
* Voronoi diagrams, ACM Transactions on Graphics, 4(2):74-123, April 1985).
* For a simplified description, see the course notes for CS348a,
* "Mathematical Foundations of Computer Graphics", available at the
* Stanford bookstore (and taught during the fall quarter).
* The implementation also borrows a tiny subset of the graph-based approach
* use in Mantyla's Geometric Work Bench (see M. Mantyla, An Introduction
* to Sold Modeling, Computer Science Press, Rockville, Maryland, 1988).
*
* The fundamental data structure is the "half-edge".  Two half-edges
* go together to make an edge, but they point in opposite directions.
* Each half-edge has a pointer to its mate (the "symmetric" half-edge Sym),
* its origin vertex (Org), the face on its left side (Lface), and the
* adjacent half-edges in the CCW direction around the origin vertex
* (Onext) and around the left face (Lnext).  There is also a "next"
* pointer for the global edge list (see below).
*
* The notation used for mesh navigation:
*  Sym   = the mate of a half-edge (same edge, but opposite direction)
*  Onext = edge CCW around origin vertex (keep same origin)
*  Dnext = edge CCW around destination vertex (keep same dest)
*  Lnext = edge CCW around left face (dest becomes new origin)
*  Rnext = edge CCW around right face (origin becomes new dest)
*
* "prev" means to substitute CW for CCW in the definitions above.
*
* The mesh keeps global lists of all vertices, faces, and edges,
* stored as doubly-linked circular lists with a dummy header node.
* The mesh stores pointers to these dummy headers (vHead, fHead, eHead).
*
* The circular edge list is special; since half-edges always occur
* in pairs (e and e->Sym), each half-edge stores a pointer in only
* one direction.  Starting at eHead and following the e->next pointers
* will visit each *edge* once (ie. e or e->Sym, but not both).
* e->Sym stores a pointer in the opposite direction, thus it is
* always true that e->Sym->next->Sym->next == e.
*
* Each vertex has a pointer to next and previous vertices in the
* circular list, and a pointer to a half-edge with this vertex as
* the origin (NULL if this is the dummy header).  There is also a
* field "data" for client data.
*
* Each face has a pointer to the next and previous faces in the
* circular list, and a pointer to a half-edge with this face as
* the left face (NULL if this is the dummy header).  There is also
* a field "data" for client data.
*
* Note that what we call a "face" is really a loop; faces may consist
* of more than one loop (ie. not simply connected), but there is no
* record of this in the data structure.  The mesh may consist of
* several disconnected regions, so it may not be possible to visit
* the entire mesh by starting at a half-edge and traversing the edge
* structure.
*
* The mesh does NOT support isolated vertices; a vertex is deleted along
* with its last edge.  Similarly when two faces are merged, one of the
* faces is deleted (see tessMeshDelete below).  For mesh operations,
* all face (loop) and vertex pointers must not be NULL.  However, once
* mesh manipulation is finished, TESSmeshZapFace can be used to delete
* faces of the mesh, one at a time.  All external faces can be "zapped"
* before the mesh is returned to the client; then a NULL face indicates
* a region which is not part of the output polygon.
*/

function TESSvertex() {
	this.next = null;	/* next vertex (never NULL) */
	this.prev = null;	/* previous vertex (never NULL) */
	this.anEdge = null;	/* a half-edge with this origin */

	/* Internal data (keep hidden) */
	this.coords = [0,0,0];	/* vertex location in 3D */
	this.s = 0.0;
	this.t = 0.0;			/* projection onto the sweep plane */
	this.pqHandle = 0;		/* to allow deletion from priority queue */
	this.n = 0;				/* to allow identify unique vertices */
	this.idx = 0;			/* to allow map result to original verts */
} 

function TESSface() {
	this.next = null;		/* next face (never NULL) */
	this.prev = null;		/* previous face (never NULL) */
	this.anEdge = null;		/* a half edge with this left face */

	/* Internal data (keep hidden) */
	this.trail = null;		/* "stack" for conversion to strips */
	this.n = 0;				/* to allow identiy unique faces */
	this.marked = false;	/* flag for conversion to strips */
	this.inside = false;	/* this face is in the polygon interior */
};

function TESShalfEdge(side) {
	this.next = null;		/* doubly-linked list (prev==Sym->next) */
	this.Sym = null;		/* same edge, opposite direction */
	this.Onext = null;		/* next edge CCW around origin */
	this.Lnext = null;		/* next edge CCW around left face */
	this.Org = null;		/* origin vertex (Overtex too long) */
	this.Lface = null;		/* left face */

	/* Internal data (keep hidden) */
	this.activeRegion = null;	/* a region with this upper edge (sweep.c) */
	this.winding = 0;			/* change in winding number when crossing
								   from the right face to the left face */
	this.side = side;
};

TESShalfEdge.prototype = {
	get Rface() { return this.Sym.Lface; },
	set Rface(v) { this.Sym.Lface = v; },
	get Dst() { return this.Sym.Org; },
	set Dst(v) { this.Sym.Org = v; },
	get Oprev() { return this.Sym.Lnext; },
	set Oprev(v) { this.Sym.Lnext = v; },
	get Lprev() { return this.Onext.Sym; },
	set Lprev(v) { this.Onext.Sym = v; },
	get Dprev() { return this.Lnext.Sym; },
	set Dprev(v) { this.Lnext.Sym = v; },
	get Rprev() { return this.Sym.Onext; },
	set Rprev(v) { this.Sym.Onext = v; },
	get Dnext() { return /*this.Rprev*/this.Sym.Onext.Sym; },  /* 3 pointers */
	set Dnext(v) { /*this.Rprev*/this.Sym.Onext.Sym = v; },  /* 3 pointers */
	get Rnext() { return /*this.Oprev*/this.Sym.Lnext.Sym; },  /* 3 pointers */
	set Rnext(v) { /*this.Oprev*/this.Sym.Lnext.Sym = v; },  /* 3 pointers */
};



function TESSmesh() {
	var v = new TESSvertex();
	var f = new TESSface();
	var e = new TESShalfEdge(0);
	var eSym = new TESShalfEdge(1);

	v.next = v.prev = v;
	v.anEdge = null;

	f.next = f.prev = f;
	f.anEdge = null;
	f.trail = null;
	f.marked = false;
	f.inside = false;

	e.next = e;
	e.Sym = eSym;
	e.Onext = null;
	e.Lnext = null;
	e.Org = null;
	e.Lface = null;
	e.winding = 0;
	e.activeRegion = null;

	eSym.next = eSym;
	eSym.Sym = e;
	eSym.Onext = null;
	eSym.Lnext = null;
	eSym.Org = null;
	eSym.Lface = null;
	eSym.winding = 0;
	eSym.activeRegion = null;

	this.vHead = v;		/* dummy header for vertex list */
	this.fHead = f;		/* dummy header for face list */
	this.eHead = e;		/* dummy header for edge list */
	this.eHeadSym = eSym;	/* and its symmetric counterpart */
};

/* The mesh operations below have three motivations: completeness,
* convenience, and efficiency.  The basic mesh operations are MakeEdge,
* Splice, and Delete.  All the other edge operations can be implemented
* in terms of these.  The other operations are provided for convenience
* and/or efficiency.
*
* When a face is split or a vertex is added, they are inserted into the
* global list *before* the existing vertex or face (ie. e->Org or e->Lface).
* This makes it easier to process all vertices or faces in the global lists
* without worrying about processing the same data twice.  As a convenience,
* when a face is split, the "inside" flag is copied from the old face.
* Other internal data (v->data, v->activeRegion, f->data, f->marked,
* f->trail, e->winding) is set to zero.
*
* ********************** Basic Edge Operations **************************
*
* tessMeshMakeEdge( mesh ) creates one edge, two vertices, and a loop.
* The loop (face) consists of the two new half-edges.
*
* tessMeshSplice( eOrg, eDst ) is the basic operation for changing the
* mesh connectivity and topology.  It changes the mesh so that
*  eOrg->Onext <- OLD( eDst->Onext )
*  eDst->Onext <- OLD( eOrg->Onext )
* where OLD(...) means the value before the meshSplice operation.
*
* This can have two effects on the vertex structure:
*  - if eOrg->Org != eDst->Org, the two vertices are merged together
*  - if eOrg->Org == eDst->Org, the origin is split into two vertices
* In both cases, eDst->Org is changed and eOrg->Org is untouched.
*
* Similarly (and independently) for the face structure,
*  - if eOrg->Lface == eDst->Lface, one loop is split into two
*  - if eOrg->Lface != eDst->Lface, two distinct loops are joined into one
* In both cases, eDst->Lface is changed and eOrg->Lface is unaffected.
*
* tessMeshDelete( eDel ) removes the edge eDel.  There are several cases:
* if (eDel->Lface != eDel->Rface), we join two loops into one; the loop
* eDel->Lface is deleted.  Otherwise, we are splitting one loop into two;
* the newly created loop will contain eDel->Dst.  If the deletion of eDel
* would create isolated vertices, those are deleted as well.
*
* ********************** Other Edge Operations **************************
*
* tessMeshAddEdgeVertex( eOrg ) creates a new edge eNew such that
* eNew == eOrg->Lnext, and eNew->Dst is a newly created vertex.
* eOrg and eNew will have the same left face.
*
* tessMeshSplitEdge( eOrg ) splits eOrg into two edges eOrg and eNew,
* such that eNew == eOrg->Lnext.  The new vertex is eOrg->Dst == eNew->Org.
* eOrg and eNew will have the same left face.
*
* tessMeshConnect( eOrg, eDst ) creates a new edge from eOrg->Dst
* to eDst->Org, and returns the corresponding half-edge eNew.
* If eOrg->Lface == eDst->Lface, this splits one loop into two,
* and the newly created loop is eNew->Lface.  Otherwise, two disjoint
* loops are merged into one, and the loop eDst->Lface is destroyed.
*
* ************************ Other Operations *****************************
*
* tessMeshNewMesh() creates a new mesh with no edges, no vertices,
* and no loops (what we usually call a "face").
*
* tessMeshUnion( mesh1, mesh2 ) forms the union of all structures in
* both meshes, and returns the new mesh (the old meshes are destroyed).
*
* tessMeshDeleteMesh( mesh ) will free all storage for any valid mesh.
*
* tessMeshZapFace( fZap ) destroys a face and removes it from the
* global face list.  All edges of fZap will have a NULL pointer as their
* left face.  Any edges which also have a NULL pointer as their right face
* are deleted entirely (along with any isolated vertices this produces).
* An entire mesh can be deleted by zapping its faces, one at a time,
* in any order.  Zapped faces cannot be used in further mesh operations!
*
* tessMeshCheckMesh( mesh ) checks a mesh for self-consistency.
*/

TESSmesh.prototype = {

	/* MakeEdge creates a new pair of half-edges which form their own loop.
	* No vertex or face structures are allocated, but these must be assigned
	* before the current edge operation is completed.
	*/
	//static TESShalfEdge *MakeEdge( TESSmesh* mesh, TESShalfEdge *eNext )
	makeEdge_: function(eNext) {
		var e = new TESShalfEdge(0);
		var eSym = new TESShalfEdge(1);

		/* Make sure eNext points to the first edge of the edge pair */
		if( eNext.Sym.side < eNext.side ) { eNext = eNext.Sym; }

		/* Insert in circular doubly-linked list before eNext.
		* Note that the prev pointer is stored in Sym->next.
		*/
		ePrev = eNext.Sym.next;
		eSym.next = ePrev;
		ePrev.Sym.next = e;
		e.next = eNext;
		eNext.Sym.next = eSym;

		e.Sym = eSym;
		e.Onext = e;
		e.Lnext = eSym;
		e.Org = null;
		e.Lface = nul;
		e.winding = 0;
		e.activeRegion = null;

		eSym.Sym = e;
		eSym.Onext = eSym;
		eSym.Lnext = e;
		eSym.Org = null;
		eSym.Lface = null;
		eSym.winding = 0;
		eSym.activeRegion = null;

		return e;
	},

	/* Splice( a, b ) is best described by the Guibas/Stolfi paper or the
	* CS348a notes (see mesh.h).  Basically it modifies the mesh so that
	* a->Onext and b->Onext are exchanged.  This can have various effects
	* depending on whether a and b belong to different face or vertex rings.
	* For more explanation see tessMeshSplice() below.
	*/
	// static void Splice( TESShalfEdge *a, TESShalfEdge *b )
	splice_: function(a, b) {
		var aOnext = a.Onext;
		var bOnext = b.Onext;
		aOnext.Sym.Lnext = b;
		bOnext.Sym.Lnext = a;
		a.Onext = bOnext;
		b.Onext = aOnext;
	},

	/* MakeVertex( newVertex, eOrig, vNext ) attaches a new vertex and makes it the
	* origin of all edges in the vertex loop to which eOrig belongs. "vNext" gives
	* a place to insert the new vertex in the global vertex list.  We insert
	* the new vertex *before* vNext so that algorithms which walk the vertex
	* list will not see the newly created vertices.
	*/
	//static void MakeVertex( TESSvertex *newVertex, TESShalfEdge *eOrig, TESSvertex *vNext )
	makeVertex_: function(newVertex, eOrig, vNext) {
		var vNew = newVertex;
		assert(vNew !== null);

		/* insert in circular doubly-linked list before vNext */
		var vPrev = vNext.prev;
		vNew.prev = vPrev;
		vPrev.next = vNew;
		vNew.next = vNext;
		vNext.prev = vNew;

		vNew.anEdge = eOrig;
		/* leave coords, s, t undefined */

		/* fix other edges on this vertex loop */
		var e = eOrig;
		do {
			e.Org = vNew;
			e = e.Onext;
		} while(e !== eOrig);
	},

	/* MakeFace( newFace, eOrig, fNext ) attaches a new face and makes it the left
	* face of all edges in the face loop to which eOrig belongs.  "fNext" gives
	* a place to insert the new face in the global face list.  We insert
	* the new face *before* fNext so that algorithms which walk the face
	* list will not see the newly created faces.
	*/
	// static void MakeFace( TESSface *newFace, TESShalfEdge *eOrig, TESSface *fNext )
	makeFace_: function(newFace, eOrig, fNext) {
		var fNew = newFace;
		assert(fNew !== null); 

		/* insert in circular doubly-linked list before fNext */
		var fPrev = fNext.prev;
		fNew.prev = fPrev;
		fPrev.next = fNew;
		fNew.next = fNext;
		fNext.prev = fNew;

		fNew.anEdge = eOrig;
		fNew.trail = null;
		fNew.marked = false;

		/* The new face is marked "inside" if the old one was.  This is a
		* convenience for the common case where a face has been split in two.
		*/
		fNew.inside = fNext.inside;

		/* fix other edges on this face loop */
		var e = eOrig;
		do {
			e.Lface = fNew;
			e = e.Lnext;
		} while(e !== eOrig);
	},

	/* KillEdge( eDel ) destroys an edge (the half-edges eDel and eDel->Sym),
	* and removes from the global edge list.
	*/
	//static void KillEdge( TESSmesh *mesh, TESShalfEdge *eDel )
	killEdge_: function(eDel) {
		/* Half-edges are allocated in pairs, see EdgePair above */
		if( eDel.Sym.side < eDel.side ) { eDel = eDel.Sym; }

		/* delete from circular doubly-linked list */
		var eNext = eDel.next;
		var ePrev = eDel.Sym.next;
		eNext.Sym.next = ePrev;
		ePrev.Sym.next = eNext;
	},


	/* KillVertex( vDel ) destroys a vertex and removes it from the global
	* vertex list.  It updates the vertex loop to point to a given new vertex.
	*/
	//static void KillVertex( TESSmesh *mesh, TESSvertex *vDel, TESSvertex *newOrg )
	killVertex_: function(vDel, newOrg) {
		var eStart = vDel.anEdge;
		/* change the origin of all affected edges */
		var e = eStart;
		do {
			e.Org = newOrg;
			e = e.Onext;
		} while(e !== eStart);

		/* delete from circular doubly-linked list */
		var vPrev = vDel.prev;
		var vNext = vDel.next;
		vNext.prev = vPrev;
		vPrev.next = vNext;
	},

	/* KillFace( fDel ) destroys a face and removes it from the global face
	* list.  It updates the face loop to point to a given new face.
	*/
	//static void KillFace( TESSmesh *mesh, TESSface *fDel, TESSface *newLface )
	killFace_: function(fDel, newLface) {
		var eStart = fDel.anEdge;

		/* change the left face of all affected edges */
		var e = eStart;
		do {
			e.Lface = newLface;
			e = e.Lnext;
		} while(e !== eStart);

		/* delete from circular doubly-linked list */
		var fPrev = fDel.prev;
		var fNext = fDel.next;
		fNext.prev = fPrev;
		fPrev.next = fNext;
	},

	/****************** Basic Edge Operations **********************/

	/* tessMeshMakeEdge creates one edge, two vertices, and a loop (face).
	* The loop consists of the two new half-edges.
	*/
	//TESShalfEdge *tessMeshMakeEdge( TESSmesh *mesh )
	makeEdge: function() {
		var newVertex1 = new TESSvertex();
		var newVertex2 = new TESSvertex();
		var newFace = new TESSface();
		var e = this.makeEdge_( this.eHead);
		this.makeVertex_( newVertex1, e, this.vHead );
		this.makeVertex_( newVertex2, e.Sym, this.vHead );
		this.makeFace_( newFace, e, this.fHead );
		return e;
	},

	/* tessMeshSplice( eOrg, eDst ) is the basic operation for changing the
	* mesh connectivity and topology.  It changes the mesh so that
	*	eOrg->Onext <- OLD( eDst->Onext )
	*	eDst->Onext <- OLD( eOrg->Onext )
	* where OLD(...) means the value before the meshSplice operation.
	*
	* This can have two effects on the vertex structure:
	*  - if eOrg->Org != eDst->Org, the two vertices are merged together
	*  - if eOrg->Org == eDst->Org, the origin is split into two vertices
	* In both cases, eDst->Org is changed and eOrg->Org is untouched.
	*
	* Similarly (and independently) for the face structure,
	*  - if eOrg->Lface == eDst->Lface, one loop is split into two
	*  - if eOrg->Lface != eDst->Lface, two distinct loops are joined into one
	* In both cases, eDst->Lface is changed and eOrg->Lface is unaffected.
	*
	* Some special cases:
	* If eDst == eOrg, the operation has no effect.
	* If eDst == eOrg->Lnext, the new face will have a single edge.
	* If eDst == eOrg->Lprev, the old face will have a single edge.
	* If eDst == eOrg->Onext, the new vertex will have a single edge.
	* If eDst == eOrg->Oprev, the old vertex will have a single edge.
	*/
	//int tessMeshSplice( TESSmesh* mesh, TESShalfEdge *eOrg, TESShalfEdge *eDst )
	splice: function(eOrg, eDst) {
		var joiningLoops = false;
		var joiningVertices = false;

		if( eOrg === eDst ) return;

		if( eDst.Org !== eOrg.Org ) {
			/* We are merging two disjoint vertices -- destroy eDst->Org */
			joiningVertices = true;
			this.killVertex_( eDst.Org, eOrg.Org );
		}
		if( eDst.Lface !== eOrg.Lface ) {
			/* We are connecting two disjoint loops -- destroy eDst->Lface */
			joiningLoops = true;
			this.killFace_( eDst.Lface, eOrg.Lface );
		}

		/* Change the edge structure */
		this.splice_( eDst, eOrg );

		if( ! joiningVertices ) {
			var newVertex = new TESSvertex();

			/* We split one vertex into two -- the new vertex is eDst->Org.
			* Make sure the old vertex points to a valid half-edge.
			*/
			this.makeVertex_( newVertex, eDst, eOrg.Org );
			eOrg.Org.anEdge = eOrg;
		}
		if( ! joiningLoops ) {
			var newFace = new TESSface();  

			/* We split one loop into two -- the new loop is eDst->Lface.
			* Make sure the old face points to a valid half-edge.
			*/
			this.makeFace_( newFace, eDst, eOrg.Lface );
			eOrg.Lface.anEdge = eOrg;
		}
	},

	/* tessMeshDelete( eDel ) removes the edge eDel.  There are several cases:
	* if (eDel->Lface != eDel->Rface), we join two loops into one; the loop
	* eDel->Lface is deleted.  Otherwise, we are splitting one loop into two;
	* the newly created loop will contain eDel->Dst.  If the deletion of eDel
	* would create isolated vertices, those are deleted as well.
	*
	* This function could be implemented as two calls to tessMeshSplice
	* plus a few calls to memFree, but this would allocate and delete
	* unnecessary vertices and faces.
	*/
	//int tessMeshDelete( TESSmesh *mesh, TESShalfEdge *eDel )
	delete: function(eDel) {
		var eDelSym = eDel.Sym;
		var joiningLoops = false;

		/* First step: disconnect the origin vertex eDel->Org.  We make all
		* changes to get a consistent mesh in this "intermediate" state.
		*/
		if( eDel.Lface !== eDel.Rface ) {
			/* We are joining two loops into one -- remove the left face */
			joiningLoops = true;
			this.killFace_( eDel.Lface, eDel.Rface );
		}

		if( eDel.Onext === eDel ) {
			this.killVertex_( eDel.Org, null );
		} else {
			/* Make sure that eDel->Org and eDel->Rface point to valid half-edges */
			eDel.Rface.anEdge = eDel.Oprev;
			eDel.Org.anEdge = eDel.Onext;

			this.splice_( eDel, eDel.Oprev );
			if( ! joiningLoops ) {
				var newFace = new TESSface();

				/* We are splitting one loop into two -- create a new loop for eDel. */
				this.makeFace_( newFace, eDel, eDel.Lface );
			}
		}

		/* Claim: the mesh is now in a consistent state, except that eDel->Org
		* may have been deleted.  Now we disconnect eDel->Dst.
		*/
		if( eDelSym.Onext === eDelSym ) {
			this.killVertex_( eDelSym.Org, null );
			this.killFace_( eDelSym.Lface, null );
		} else {
			/* Make sure that eDel->Dst and eDel->Lface point to valid half-edges */
			eDel.Lface.anEdge = eDelSym.Oprev;
			eDelSym.Org.anEdge = eDelSym.Onext;
			this.splice_( eDelSym, eDelSym.Oprev );
		}

		/* Any isolated vertices or faces have already been freed. */
		this.killEdge_( eDel );
	},

	/******************** Other Edge Operations **********************/

	/* All these routines can be implemented with the basic edge
	* operations above.  They are provided for convenience and efficiency.
	*/


	/* tessMeshAddEdgeVertex( eOrg ) creates a new edge eNew such that
	* eNew == eOrg->Lnext, and eNew->Dst is a newly created vertex.
	* eOrg and eNew will have the same left face.
	*/
	// TESShalfEdge *tessMeshAddEdgeVertex( TESSmesh *mesh, TESShalfEdge *eOrg );
	addEdgeVertex: function(eOrg) {
		var eNew = this.makeEdge_( eOrg );
		var eNewSym = eNew.Sym;

		/* Connect the new edge appropriately */
		this.splice_( eNew, eOrg.Lnext );

		/* Set the vertex and face information */
		eNew.Org = eOrg.Dst;

		var newVertex = new TESSvertex();
		this.makeVertex_( newVertex, eNewSym, eNew.Org );

		eNew.Lface = eNewSym.Lface = eOrg.Lface;

		return eNew;
	},


	/* tessMeshSplitEdge( eOrg ) splits eOrg into two edges eOrg and eNew,
	* such that eNew == eOrg->Lnext.  The new vertex is eOrg->Dst == eNew->Org.
	* eOrg and eNew will have the same left face.
	*/
	// TESShalfEdge *tessMeshSplitEdge( TESSmesh *mesh, TESShalfEdge *eOrg );
	splitEdge: function(eOrg, eDst) {
		var tempHalfEdge = this.addEdgeVertex( eOrg );
		var eNew = tempHalfEdge.Sym;

		/* Disconnect eOrg from eOrg->Dst and connect it to eNew->Org */
		this.splice_( eOrg.Sym, eOrg.Sym.Oprev );
		this.splice_( eOrg.Sym, eNew );

		/* Set the vertex and face information */
		eOrg.Dst = eNew.Org;
		eNew.Dst.anEdge = eNew.Sym;	/* may have pointed to eOrg->Sym */
		eNew.Rface = eOrg.Rface;
		eNew.winding = eOrg.winding;	/* copy old winding information */
		eNew.Sym.winding = eOrg.Sym.winding;

		return eNew;
	},


	/* tessMeshConnect( eOrg, eDst ) creates a new edge from eOrg->Dst
	* to eDst->Org, and returns the corresponding half-edge eNew.
	* If eOrg->Lface == eDst->Lface, this splits one loop into two,
	* and the newly created loop is eNew->Lface.  Otherwise, two disjoint
	* loops are merged into one, and the loop eDst->Lface is destroyed.
	*
	* If (eOrg == eDst), the new face will have only two edges.
	* If (eOrg->Lnext == eDst), the old face is reduced to a single edge.
	* If (eOrg->Lnext->Lnext == eDst), the old face is reduced to two edges.
	*/

	// TESShalfEdge *tessMeshConnect( TESSmesh *mesh, TESShalfEdge *eOrg, TESShalfEdge *eDst );
	connect: function(eOrg, eDst) {
		var joiningLoops = false;  
		var eNew = this.makeEdge_( eOrg );
		var eNewSym = eNew.Sym;

		if( eDst.Lface !== eOrg.Lface ) {
			/* We are connecting two disjoint loops -- destroy eDst->Lface */
			joiningLoops = true;
			this.killFace_( eDst.Lface, eOrg.Lface );
		}

		/* Connect the new edge appropriately */
		this.splice_( eNew, eOrg.Lnext );
		this.splice_( eNewSym, eDst );

		/* Set the vertex and face information */
		eNew.Org = eOrg.Dst;
		eNewSym.Org = eDst.Org;
		eNew.Lface = eNewSym.Lface = eOrg.Lface;

		/* Make sure the old face points to a valid half-edge */
		eOrg.Lface.anEdge = eNewSym;

		if( ! joiningLoops ) {
			var newFace = new TESSface();
			/* We split one loop into two -- the new loop is eNew->Lface */
			this.makeFace_( newFace, eNew, eOrg.Lface );
		}
		return eNew;
	},


	/* tessMeshCheckMesh( mesh ) checks a mesh for self-consistency.
	*/
	check: function() {
		var fHead = this.fHead;
		var vHead = this.vHead;
		var eHead = this.eHead;
		var f, fPrev, v, vPrev, e, ePrev;

		fPrev = fHead;
		for( fPrev = fHead ; (f = fPrev.next) !== fHead; fPrev = f) {
			assert( f.prev === fPrev );
			e = f.anEdge;
			do {
				assert( e.Sym !== e );
				assert( e.Sym.Sym === e );
				assert( e.Lnext.Onext.Sym === e );
				assert( e.Onext.Sym.Lnext === e );
				assert( e.Lface === f );
				e = e.Lnext;
			} while( e !== fanEdge );
		}
		assert( fprev === fPrev && f.anEdge === null );

		vPrev = vHead;
		for( vPrev = vHead ; (v = vPrev.next) !== vHead; vPrev = v) {
			assert( v.prev === vPrev );
			e = v.anEdge;
			do {
				assert( e.Sym !== e );
				assert( e.Sym.Sym === e );
				assert( e.Lnext.Onext.Sym === e );
				assert( e.Onext.Sym.Lnext === e );
				assert( e.Org === v );
				e = e.Onext;
			} while( e !== v.anEdge );
		}
		assert( v.prev === vPrev && v.anEdge === null );

		ePrev = eHead;
		for( ePrev = eHead ; (e = ePrev.next) !== eHead; ePrev = e) {
			assert( e.Sym.next === ePrev.Sym );
			assert( e.Sym !== e );
			assert( e.Sym.Sym === e );
			assert( e.Org !== null );
			assert( e.Dst !== null );
			assert( e.Lnext.Onext.Sym === e );
			assert( e.Onext.Sym.Lnext === e );
		}
		assert( e.Sym.next === ePrev.Sym
			&& e.Sym === this.eHeadSym
			&& e.Sym.Sym === e
			&& e.Org === null && e.Dst === null
			&& e.Lface === null && e.Rface === null );
	}

};

var Geom = {};

Geom.vertEq = function(u,v) {
	return (u.s === v.s && u.t === v.t);
};

/* Returns TRUE if u is lexicographically <= v. */
Geom.vertLeq = function(u,v) {
	return ((u.s < v.s) || (u.s === v.s && u.t <= v.t));
};

/* Versions of VertLeq, EdgeSign, EdgeEval with s and t transposed. */
Geom.transLeq = function(u,v) {
	return ((u.t < v.t) || (u.t === v.t && u.s <= v.s));
};

Geom.edgeGoesLeft = function(e) {
	return Geom.vertLeq( e.Dst, e.Org );
};

Geom.edgeGoesRight = function(e) {
	return Geom.vertLeq( e.Org, e.Dst );
};

Geom.vertL1dist = function(u,v) {
	return (Math.abs(u.s - v.s) + Math.abs(u.t - v.t));
};

//TESSreal tesedgeEval( TESSvertex *u, TESSvertex *v, TESSvertex *w )
Geom.edgeEval = function( u, v, w ) {
	/* Given three vertices u,v,w such that VertLeq(u,v) && VertLeq(v,w),
	* evaluates the t-coord of the edge uw at the s-coord of the vertex v.
	* Returns v->t - (uw)(v->s), ie. the signed distance from uw to v.
	* If uw is vertical (and thus passes thru v), the result is zero.
	*
	* The calculation is extremely accurate and stable, even when v
	* is very close to u or w.  In particular if we set v->t = 0 and
	* let r be the negated result (this evaluates (uw)(v->s)), then
	* r is guaranteed to satisfy MIN(u->t,w->t) <= r <= MAX(u->t,w->t).
	*/
	assert( Geom.vertLeq( u, v ) && Geom.vertLeq( v, w ));

	var gapL = v.s - u.s;
	var gapR = w.s - v.s;

	if( gapL + gapR > 0.0 ) {
		if( gapL < gapR ) {
			return (v.t - u.t) + (u.t - w.t) * (gapL / (gapL + gapR));
		} else {
			return (v.t - w.t) + (w.t - u.t) * (gapR / (gapL + gapR));
		}
	}
	/* vertical line */
	return 0.0;
};

//TESSreal tesedgeSign( TESSvertex *u, TESSvertex *v, TESSvertex *w )
Geom.edgeSign = function( u, v, w ) {
	/* Returns a number whose sign matches EdgeEval(u,v,w) but which
	* is cheaper to evaluate.  Returns > 0, == 0 , or < 0
	* as v is above, on, or below the edge uw.
	*/
	assert( Geom.vertLeq( u, v ) && Geom.vertLeq( v, w ));

	var gapL = v.s - u.s;
	var gapR = w.s - v.s;

	if( gapL + gapR > 0.0 ) {
		return (v.t - w.t) * gapL + (v.t - u.t) * gapR;
	}
	/* vertical line */
	return 0.0;
};


/***********************************************************************
* Define versions of EdgeSign, EdgeEval with s and t transposed.
*/

//TESSreal testransEval( TESSvertex *u, TESSvertex *v, TESSvertex *w )
Geom.transEval = function( u, v, w ) {
	/* Given three vertices u,v,w such that TransLeq(u,v) && TransLeq(v,w),
	* evaluates the t-coord of the edge uw at the s-coord of the vertex v.
	* Returns v->s - (uw)(v->t), ie. the signed distance from uw to v.
	* If uw is vertical (and thus passes thru v), the result is zero.
	*
	* The calculation is extremely accurate and stable, even when v
	* is very close to u or w.  In particular if we set v->s = 0 and
	* let r be the negated result (this evaluates (uw)(v->t)), then
	* r is guaranteed to satisfy MIN(u->s,w->s) <= r <= MAX(u->s,w->s).
	*/
	assert( Geom.transLeq( u, v ) && Geom.transLeq( v, w ));

	var gapL = v.t - u.t;
	var gapR = w.t - v.t;

	if( gapL + gapR > 0.0 ) {
		if( gapL < gapR ) {
			return (v.s - u.s) + (u.s - w.s) * (gapL / (gapL + gapR));
		} else {
			return (v.s - w.s) + (w.s - u.s) * (gapR / (gapL + gapR));
		}
	}
	/* vertical line */
	return 0.0;
};

//TESSreal testransSign( TESSvertex *u, TESSvertex *v, TESSvertex *w )
Geom.transSign = function( u, v, w ) {
	/* Returns a number whose sign matches TransEval(u,v,w) but which
	* is cheaper to evaluate.  Returns > 0, == 0 , or < 0
	* as v is above, on, or below the edge uw.
	*/
	assert( Geom.transLeq( u, v ) && Geom.transLeq( v, w ));

	var gapL = v.t - u.t;
	var gapR = w.t - v.t;

	if( gapL + gapR > 0.0 ) {
		return (v.s - w.s) * gapL + (v.s - u.s) * gapR;
	}
	/* vertical line */
	return 0.0;
};


//int tesvertCCW( TESSvertex *u, TESSvertex *v, TESSvertex *w )
Geom.vertCCW = function( u, v, w ) {
	/* For almost-degenerate situations, the results are not reliable.
	* Unless the floating-point arithmetic can be performed without
	* rounding errors, *any* implementation will give incorrect results
	* on some degenerate inputs, so the client must have some way to
	* handle this situation.
	*/
	return (u.s*(v.t - w.t) + v.s*(w.t - u.t) + w.s*(u.t - v.t)) >= 0.0;
};

/* Given parameters a,x,b,y returns the value (b*x+a*y)/(a+b),
* or (x+y)/2 if a==b==0.  It requires that a,b >= 0, and enforces
* this in the rare case that one argument is slightly negative.
* The implementation is extremely stable numerically.
* In particular it guarantees that the result r satisfies
* MIN(x,y) <= r <= MAX(x,y), and the results are very accurate
* even when a and b differ greatly in magnitude.
*/
Geom.interpolate = function(a,x,b,y) {
	return (a = (a < 0) ? 0 : a, b = (b < 0) ? 0 : b, ((a <= b) ? ((b == 0) ? ((x+y) / 2) : (x + (y-x) * (a/(a+b)))) : (y + (x-y) * (b/(a+b)))));
};

/*
#ifndef FOR_TRITE_TEST_PROGRAM
#define Interpolate(a,x,b,y)	RealInterpolate(a,x,b,y)
#else

// Claim: the ONLY property the sweep algorithm relies on is that
// MIN(x,y) <= r <= MAX(x,y).  This is a nasty way to test that.
#include <stdlib.h>
extern int RandomInterpolate;

double Interpolate( double a, double x, double b, double y)
{
	printf("*********************%d\n",RandomInterpolate);
	if( RandomInterpolate ) {
		a = 1.2 * drand48() - 0.1;
		a = (a < 0) ? 0 : ((a > 1) ? 1 : a);
		b = 1.0 - a;
	}
	return RealInterpolate(a,x,b,y);
}
#endif*/

Geom.intersect = function( o1, d1, o2, d2, v ) {
	/* Given edges (o1,d1) and (o2,d2), compute their point of intersection.
	* The computed point is guaranteed to lie in the intersection of the
	* bounding rectangles defined by each edge.
	*/
	var z1, z2;
	var swap = function(a,b) { var t = a; a = b; b = t; };

	/* This is certainly not the most efficient way to find the intersection
	* of two line segments, but it is very numerically stable.
	*
	* Strategy: find the two middle vertices in the VertLeq ordering,
	* and interpolate the intersection s-value from these.  Then repeat
	* using the TransLeq ordering to find the intersection t-value.
	*/

	if( ! Geom.vertLeq( o1, d1 )) { swap( o1, d1 ); }
	if( ! Geom.vertLeq( o2, d2 )) { swap( o2, d2 ); }
	if( ! Geom.vertLeq( o1, o2 )) { swap( o1, o2 ); swap( d1, d2 ); }

	if( ! Geom.vertLeq( o2, d1 )) {
		/* Technically, no intersection -- do our best */
		v.s = (o2.s + d1.s) / 2;
	} else if( Geom.vertLeq( d1, d2 )) {
		/* Interpolate between o2 and d1 */
		z1 = Geom.edgeEval( o1, o2, d1 );
		z2 = Geom.edgeEval( o2, d1, d2 );
		if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
		v.s = Geom.interpolate( z1, o2.s, z2, d1.s );
	} else {
		/* Interpolate between o2 and d2 */
		z1 = Geom.edgeSign( o1, o2, d1 );
		z2 = -Geom.edgeSign( o1, d2, d1 );
		if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
		v.s = Geom.interpolate( z1, o2.s, z2, d2.s );
	}

	/* Now repeat the process for t */

	if( ! Geom.transLeq( o1, d1 )) { swap( o1, d1 ); }
	if( ! Geom.transLeq( o2, d2 )) { swap( o2, d2 ); }
	if( ! Geom.transLeq( o1, o2 )) { swap( o1, o2 ); swap( d1, d2 ); }

	if( ! Geom.transLeq( o2, d1 )) {
		/* Technically, no intersection -- do our best */
		v.t = (o2.t + d1.t) / 2;
	} else if( Geom.transLeq( d1, d2 )) {
		/* Interpolate between o2 and d1 */
		z1 = Geom.transEval( o1, o2, d1 );
		z2 = Geom.transEval( o2, d1, d2 );
		if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
		v.t = Geom.interpolate( z1, o2.t, z2, d1.t );
	} else {
		/* Interpolate between o2 and d2 */
		z1 = Geom.transSign( o1, o2, d1 );
		z2 = -Geom.transSign( o1, d2, d1 );
		if( z1+z2 < 0 ) { z1 = -z1; z2 = -z2; }
		v.t = Geom.interpolate( z1, o2.t, z2, d2.t );
	}
};




/* Search returns the node with the smallest key greater than or equal
* to the given key.  If there is no such key, returns a node whose
* key is NULL.  Similarly, Succ(Max(d)) has a NULL key, etc.
*/

function DictNode() {
	this.key = null;
	this.next = null;
	this.prev = null;
};

function Dict(frame, leq) {
	this.head = new DictNode();
	this.head.next = this.head;
	this.head.prev = this.head;
	this.frame = frame;
	this.leq = leq;
};

Dict.prototype = {
	min: function() {
		return this.head.next;
	},

	max: function() {
		return this.head.prev;
	},

	insert: function(k) {
		this.insertBefore(this.head, k);
	},

	search: function(key) {
		var node = this.head;
		do {
			node = node.next;
		} while( node.key !== null && ! this.leq(this.frame, key, node.key));

		return node;
	},

	insertBefore: function(node, key) {
		do {
			node = node.prev;
		} while( node.key !== null && ! this.leq(this.frame, node.key, key));

		var newNode = new DictNode();
		newNode.key = key;
		newNode.next = node.next;
		node.next.prev = newNode;
		newNode.prev = node;
		node.next = newNode;

		return newNode;
	},

	delete: function(node) {
		node.next.prev = node.prev;
		node.prev.next = node.next;
	}
};


function Tess2(opts) {


	var result = null;

	function addContour(cont) {

	};

	/*
		opts = {
			winding: 'odd', // 'odd', 'nonzero', 'positive', 'negative', 'abs_geq_two'
			eltype: 'polygons', // 'polygons', 'connected_polygons', 'boundary_contours'
			polySize: 3,
			vertexSize: 3,
			normal: [1,0,0]
		}
	*/
	function tesselate(contours, opts) {
		return {
			vertices: [],
			elements: []
		};
	};

	return {
		addContour: addContour,
		tesselate: tesselate
	};
}


var c1 = [0,0, 10,0, 5,10];
var c2 = [2,-2, 8,-2, 8,6, 2,6];
var t = new Tess2();
t.addContour(c1, {vertexSize: 3});
t.addContour(c2, {vertexSize: 3});
var res = t.tesselate({winding: 'odd', elementType: 'polygon', polySize: 3, vertexSize: 3, normal: [0,0,1]});
if (res !== null) {
	var tris = res.elements;
	var verts = res.vertices;
}
