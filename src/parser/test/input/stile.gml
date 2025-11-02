// Script assets have changed for v2.3.0 see
// https://help.yoyogames.com/hc/en-us/articles/360005277377 for more information

#macro STILE_PLATFORM_HEIGHT 120
#macro STILE_TOPTEXLENGTH 200
#macro STILE_TOPTEXHEIGHT 50
#macro STILE_SIDETEXSIZE 200
#macro STILE_BOTTOMTEXSIZE 160
#macro STILE_VERTLENGTH 120
#macro STILE_MINDIST 1
#macro STILE_MAXDIST 1000
#macro STILE_SMOOTHRADIUS 50
#macro STILE_MAXREPETITIONS 10


#macro STILE_TEX_EDGE global.stile_tex_edge
#macro STILE_TEX_SIDE global.stile_tex_side
#macro STILE_TEX_TOP global.stile_tex_top
#macro STILE_TEX_BOTTOM global.stile_tex_bottom
var border = 9 / 1024;
global.stile_tex_edge =   {x: 2/3 + border, y: 1/3 + border,	w: 1/8 - 2 * border,  h: 2/3 - 2 * border};
global.stile_tex_side =   {x: border,		y: 2/3 + border,	w: 2/3 - 2 * border,  h: 1/3 - 2 * border};
global.stile_tex_top =    {x: border,		y: border,			w: 2/3 - 2 * border,  h: 2/3 - 2 * border};
global.stile_tex_bottom = {x: 2/3 + border, y: border,			w: 1/3 - 2 * border,  h: 1/3 - 2 * border};

enum STILE_TYPE
{
	GRASS,
	SNOW,
	NUM
}

function stile_system(smoothRadius, vertLength, terraintype) constructor
{
	self.smoothRadius = smoothRadius;
	self.vertLength = vertLength;
	self.maxDist = (smoothRadius + vertLength) * 3;
	self.terraintype = terraintype;
	self.metaballs = [];
	self.vbuff = vertex_create_buffer();
	self.innerVertices = [];
	self.edgeVertices = [];
	self.c_edge_texcoord = 0;
	self.c_side_texcoord = 0;
	self.prevVert = -1;
	
	static submit = function(biomeTextures)
	{
		/*
			biomeTextures should be an array with entries for each biome type, structured like this:
			biomeTextures[type][top, edge, side, bottom]
		*/
		var num = array_length(vbuff);
		for (var i = 0; i < num; ++i)
		{
			vertex_submit(vbuff[i], pr_trianglelist, sprite_get_texture(biomeTextures[syst.terraintype][i], 0));
		}	
	}
	
	static signedDistanceFunction = function(boundingShape, metaball, p)
	{
		switch boundingShape[CM_TYPE]
		{
			case CM_OBJECTS.SPHERE:
				return p.DistanceTo(metaball.p) - metaball.r;
		}
		return maxDist;
	}
	
	static getVolumeInfo = function(spatialhash, o)
	{
		var invDist = 0;
		var sumDist = 0;
		var signedDist = 0;
		var minDist = 99999999999999;
		var region = cm_get_region(spatialhash, [o.x, o.y, o.z, o.x, o.y, o.z]);
		var n = new Vector3(0, 0, 0.001);
		var p = new Vector3(0, 0, 0);
		var i = CM_LIST_NUM;
		repeat (-region[1])
		{
			var sphere = region[i++];
			var s = cm_custom_parameter_get(sphere);
			signedDist = signedDistanceFunction(sphere, s, o);
			minDist = stile_smin(minDist, signedDist, self.smoothRadius);
			invDist = 1 / sqrt(max(1., signedDist));
			sumDist += invDist;
			n = n.Add(s.n.Mul(invDist));
			p = p.Add(s.p.Mul(invDist));
		}
		return 
		{
			dist : minDist,
			n : n.Normalize(),
			p : p.Div(sumDist)
		}
	}
	
	static addEdgePoint = function(vertices, p, d)
	{
		if (array_length(vertices) > 3)
		{
			if (p.DistanceTo(vertices[0][0].p) < self.vertLength * 1.5)
			|| (p.DistanceTo(vertices[1][0].p) < self.vertLength * 1.5)
			{
				__addVert({p: p, n: d.n, d: d})
				__addVert(vertices[0]);
				return false;
			}
		}
		array_push(vertices, __addVert({p: p, n: d.n, d: d}));
		return true;
	}
	
	static addMetaball = function(p, n, r)
	{
		array_push(self.metaballs, {p: p, n: n, r: r});
	}
	
	static addVertex = function(point, t = point.t, n = point.n)
	{
		vertex_position_3d(self.vbuff, point.p.x, point.p.y, point.p.z);
		vertex_normal(self.vbuff, n.x, n.y, n.z);
		vertex_texcoord(self.vbuff, t.x, t.y);
		vertex_color(self.vbuff, make_color_rgb(point.rgb[0] * 255, point.rgb[1] * 255, point.rgb[2] * 255), 1);
	}
			
	static __addVert = function(v)
	{
		var A, B, C, D, E;
		if (is_struct(v))
		{
			//Construct a bunch of points
			var d = v.d; //This is the anchor point determined by getVolumeInfo
			A = {
				p: v.p,
				n: v.n.Add(v.p.Sub(d.p).Normalize().Div(2)).Normalize(),
				rgb: self.terraintype == STILE_TYPE.GRASS ? [.5, .5, .5] : [1, 1, 1]};
			
			var t = clamp(1 - STILE_TOPTEXHEIGHT / d.p.DistanceTo(v.p) / 2, 0, 1);
			var k = d.p.Lerp(v.p, t);
			B = {
				p: k.Add(d.n.Mul(STILE_TOPTEXHEIGHT / 5)),
				n: v.n,
				rgb: [1, 1, 1]};
			
			var C_pos = array_create(STILE_TYPE.NUM);
			C_pos[STILE_TYPE.GRASS] = B.p.Lerp(A.p, 1.8).Sub(v.n.Mul(STILE_TOPTEXHEIGHT / 2));
			C_pos[STILE_TYPE.SNOW] = B.p.Lerp(A.p, 1.1).Sub(v.n.Mul(STILE_TOPTEXHEIGHT / 2));
			C = {
				p: C_pos[self.terraintype],
				n: B.n.Lerp(A.n, 1.2),
				rgb: self.terraintype == STILE_TYPE.GRASS ? [.2, .2, .2] : [1, 1, 1]};
				
			D = {
				p: B.p.Lerp(A.p, 1.5).Add(v.n.Mul(STILE_TOPTEXHEIGHT / 2)),
				n: A.n,
				rgb: [1, 1, 1]};
			
			var t = 1 + random(.2);
			E = {
				p: A.p.Lerp(B.p, t).Sub(v.n.Mul(STILE_PLATFORM_HEIGHT + random(STILE_PLATFORM_HEIGHT * .25))),
				n: A.p.Sub(B.p).Normalize().Sub(v.n.Mul(.15)).Normalize(),
				rgb: [1, 1, 1]};
				
			array_push(innerVertices, [B, E]);
		}
		else
		{
			A = v[0];
			B = v[1];
			C = v[2];
			D = v[3];
			E = v[4];
		}
		
		if (is_array(prevVert))
		{
			var pA = prevVert[0];
			var pB = prevVert[1];
			var pC = prevVert[2];
			var pD = prevVert[3];
			var pE = prevVert[4];
			
			//Increment the texture coord
			var p_edge_texcoord = c_edge_texcoord;
			var p_side_texcoord = c_side_texcoord;
			var dist = B.p.DistanceTo(pB.p);
			c_edge_texcoord += dist / STILE_TOPTEXLENGTH;
			c_side_texcoord += dist / STILE_SIDETEXSIZE;
			c_edge_texcoord -= floor(p_edge_texcoord);
			p_edge_texcoord -= floor(p_edge_texcoord);
			c_side_texcoord -= floor(p_side_texcoord);
			p_side_texcoord -= floor(p_side_texcoord);
							   
			//Make the side of the platform
			var ty = min(STILE_SIDETEXSIZE / A.p.DistanceTo(E.p), 1);
			addVertex(A,  new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(c_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (0)), E.n);
			addVertex(pA, new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(p_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (0)), pE.n);
			addVertex(E,  new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(c_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (ty)));
				
			addVertex(E,  new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(c_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (ty)));
			addVertex(pA, new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(p_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (0)), pE.n);
			addVertex(pE, new Vector2(STILE_TEX_SIDE.x + STILE_TEX_SIDE.w * clamp(p_side_texcoord * .5, 0, 1), STILE_TEX_SIDE.y + STILE_TEX_SIDE.h * (ty)));
			
			//First half of the border
			addVertex(B,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (0),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
			addVertex(pB, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (0),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
			addVertex(A,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
																											  
			addVertex(A,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
			addVertex(pB, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (0),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
			addVertex(pA, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
																											  
			//Extend grass over the edge																	  
			addVertex(C,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
			addVertex(A,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
			addVertex(pC, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
																											  
			addVertex(A,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
			addVertex(pA, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
			addVertex(pC, new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
			
			if (self.terraintype == STILE_TYPE.GRASS)
			{
				//Extend the edge of the grass upwards
				addVertex(pD,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
				addVertex(D,   new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
				addVertex(A,   new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
																												   
				addVertex(pD,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (1),  STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
				addVertex(A,   new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(c_edge_texcoord * .5, 0, 1)));
				addVertex(pA,  new Vector2(STILE_TEX_EDGE.x + STILE_TEX_EDGE.w * (.5), STILE_TEX_EDGE.y + STILE_TEX_EDGE.h * clamp(p_edge_texcoord * .5, 0, 1)));
			}
		}
			
		prevVert = [A, B, C, D, E];
		return prevVert;
	}
	
	static bake = function()
	{
		var spatialhash = cm_list();//self.maxDist);
		var num = array_length(self.metaballs);
		var N = new Vector3(0, 0, 0);
		self.tx1 = 0;
		self.tx2 = 0;
		self.prev = -1;
		
		edgeVertices = [];
		innerVertices = [];
		
		
		
		vertex_begin(vbuff, global.stile_format);
			
		for (var i = 0; i < num; ++i)
		{
			//Add a bounding sphere to the temporary spatial has and give it the metaball as a custom parameter
			var s = self.metaballs[i];
			var sphere = cm_sphere(s.p.x, s.p.y, s.p.z, s.r * 2 + self.smoothRadius * 2);
			cm_add(spatialhash, sphere);
			cm_custom_parameter_set(sphere, s);
		}
		
		//Ray march from far away towards the stile
		var s = self.metaballs[0];
		var v = (new Vector3(1, sqrt(2), pi)).Orthogonalize(s.n).Normalize();
		var p = s.p.Add(v.Mul(1000000));
		var d = self.getVolumeInfo(spatialhash, p);
		p = d.p.Add(p.Sub(d.p).Orthogonalize(d.n));
		repeat STILE_MAXREPETITIONS
		{
			d = self.getVolumeInfo(spatialhash, p);
			if (abs(d.dist) < STILE_MINDIST){break;}
			//Make new step direction
			v = s.p.Sub(p).Normalize();
			//Step towards the edge
			p = p.Add(v.Mul(d.dist));
			//Orthogonalize the new position to the volume normal
			p = d.p.Add(p.Sub(d.p).Orthogonalize(d.n));
		}
		
		//Start following the border
		//v = v.Cross(d.n).Normalize();
		var substeps = 10;
		var probeDist = self.vertLength / substeps;
		
		//Limit the border to 500 vertices to avoid infinite loops
		repeat 100
		{
			//Step along the edge of the volume in substeps
			repeat substeps
			{
				//Rotate the stepping direction until it hits the edge of the volume
				repeat STILE_MAXREPETITIONS
				{
					var _p = p.Add(v.Mul(probeDist));
					var d = getVolumeInfo(spatialhash, _p);
					if (abs(d.dist) < STILE_MINDIST) break;
					
					//Rotate the stepping direction around the volume normal
					v = v.Rotate(d.n, d.dist / probeDist).Orthogonalize(d.n).Normalize();
				}
				//Orthogonalize the new position to the volume normal
				p = d.p.Add(_p.Sub(d.p).Orthogonalize(d.n));
			}
			N = N.Add(d.n);
			//Add the edge point to the shape. If it has met up with the first point again, break the loop
			if (!addEdgePoint(edgeVertices, p, d)) break;
		}
		N = N.Normalize();
		
		//Make the center of the island
		var T1 = (new Vector3(1, sqrt(2), pi)).Orthogonalize(N).Normalize();
		var T2 = T1.Cross(N).Normalize();
		
		var polygonSize = array_length(innerVertices);
	
		//Loop through all the polygons
		for (var n = polygonSize; n > 2; --n)
		{
			var minDist = 999999;
			var bestA = -1;
			for (var a = 0; a < min(n, 100); ++a)
			{
				//Pick the next two points
				var b = (a + 1) mod n;
				var c = (a + 2) mod n;
			
				//Make a triangle with the selected points
				var A = innerVertices[a][0];
				var B = innerVertices[b][0];
				var C = innerVertices[c][0];
			
				//Make sure the triangle is counter-clockwise compared to the up vector
				var w = B.p.Sub(A.p).Cross(C.p.Sub(A.p)).Normalize();
				var wDotN = w.Dot(B.n);
				if (wDotN > 0)
				{
					var good = true;
					for (var i = 0; i < n; ++i)
					{
						if (i == a || i == b || i == c) continue;
						var D = innerVertices[i][0];
					
						//Make sure the triangle has no vertices inside it
						if stile_point_in_triangle(D.p, A.p, B.p, C.p, w)
						{
							good = false;
							break;
						}		
					
						//Make sure the new edge does not have any other edges crossing it
						var j = (i + 1) mod n;
						if (j == a || j == b || j == c) continue;
						var E = innerVertices[j][0];
					
						if (stile_lines_intersect(A.p, C.p, D.p, E.p, w))
						{
							good = false;
							break;
						}
					}
				
					//Add the triangle and remove the unshared vertex
					if (good)
					{
						var dist = A.p.DistanceTo(C.p) * (2 - wDotN);
						if (dist < minDist)
						{
							minDist = dist;
							bestA = a;
						}
					}
				}//else{show_debug_message("Normal not good");}				
			}
			if (bestA < 0){continue;}
			
			var a = bestA;
			var b = (a + 1) mod n;
			var c = (a + 2) mod n;
			var A = innerVertices[a][0];
			var B = innerVertices[b][0];
			var C = innerVertices[c][0];
			var D = innerVertices[a][1];
			var E = innerVertices[b][1];
			var F = innerVertices[c][1];
			
			var TA = new Vector2(A.p.Dot(T1), A.p.Dot(T2)).Div(STILE_TOPTEXLENGTH);
			var TB = new Vector2(B.p.Dot(T1), B.p.Dot(T2)).Div(STILE_TOPTEXLENGTH);
			var TC = new Vector2(C.p.Dot(T1), C.p.Dot(T2)).Div(STILE_TOPTEXLENGTH);
			var TD = TA.Min(TB.Min(TC)).Floor();
			TA = new Vector2(STILE_TEX_TOP.x + STILE_TEX_TOP.w * clamp((TA.x - TD.x) * .5, 0, 1), STILE_TEX_TOP.y + STILE_TEX_TOP.h * clamp((TA.y - TD.y) * .5, 0, 1));
			TB = new Vector2(STILE_TEX_TOP.x + STILE_TEX_TOP.w * clamp((TB.x - TD.x) * .5, 0, 1), STILE_TEX_TOP.y + STILE_TEX_TOP.h * clamp((TB.y - TD.y) * .5, 0, 1));
			TC = new Vector2(STILE_TEX_TOP.x + STILE_TEX_TOP.w * clamp((TC.x - TD.x) * .5, 0, 1), STILE_TEX_TOP.y + STILE_TEX_TOP.h * clamp((TC.y - TD.y) * .5, 0, 1));
			addVertex(A, TA);
			addVertex(B, TB);
			addVertex(C, TC);
			
			//Add bottom
			var w = E.p.Sub(D.p).Cross(F.p.Sub(D.p)).Normalize();
			TA = new Vector2(A.p.Dot(T1), A.p.Dot(T2)).Div(STILE_BOTTOMTEXSIZE);
			TB = new Vector2(B.p.Dot(T1), B.p.Dot(T2)).Div(STILE_BOTTOMTEXSIZE);
			TC = new Vector2(C.p.Dot(T1), C.p.Dot(T2)).Div(STILE_BOTTOMTEXSIZE);
			var TD = TA.Min(TB.Min(TC)).Floor();
			TA = new Vector2(STILE_TEX_BOTTOM.x + STILE_TEX_BOTTOM.w * clamp((TA.x - TD.x) * .5, 0, 1), STILE_TEX_BOTTOM.y + STILE_TEX_BOTTOM.h * clamp((TA.y - TD.y) * .5, 0, 1));
			TB = new Vector2(STILE_TEX_BOTTOM.x + STILE_TEX_BOTTOM.w * clamp((TB.x - TD.x) * .5, 0, 1), STILE_TEX_BOTTOM.y + STILE_TEX_BOTTOM.h * clamp((TB.y - TD.y) * .5, 0, 1));
			TC = new Vector2(STILE_TEX_BOTTOM.x + STILE_TEX_BOTTOM.w * clamp((TC.x - TD.x) * .5, 0, 1), STILE_TEX_BOTTOM.y + STILE_TEX_BOTTOM.h * clamp((TC.y - TD.y) * .5, 0, 1));
			addVertex(D, TA, A.n.Lerp(w, .5).Mul(-1));
			addVertex(E, TB, B.n.Lerp(w, .5).Mul(-1));
			addVertex(F, TC, C.n.Lerp(w, .5).Mul(-1));
			
			array_delete(innerVertices, b, 1);
		}
		vertex_end(vbuff);
		return vbuff;
	}
	
}

function stile_point_in_triangle(p, A, B, C, N)
{
	var e = p.Sub(A).Cross(B.Sub(A));
	if (e.Dot(N) < 0) return false;
	e = p.Sub(B).Cross(C.Sub(B));
	if (e.Dot(N) < 0) return false;
	e = p.Sub(C).Cross(A.Sub(C));
	if (e.Dot(N) < 0) return false;
	return true;
}

function lines_intersect(x1, y1, x2, y2, x3, y3, x4, y4, segment)
{
    var ua, ub, ud, ux, uy, vx, vy, wx, wy;
    ua = 0;
    ux = x2 - x1;
    uy = y2 - y1;
    vx = x4 - x3;
    vy = y4 - y3;
    wx = x1 - x3;
    wy = y1 - y3;
    ud = vy * ux - vx * uy;
    if (ud != 0) 
    {
        ua = (vx * wy - vy * wx) / ud;
        if (segment) 
        {
            ub = (ux * wy - uy * wx) / ud;
            if (ua < 0 || ua > 1 || ub < 0 || ub > 1) ua = 0;
        }
    }
    return ua;
}

function stile_lines_intersect(A, B, C, D, N)
{
	var AB = B.Sub(A);
	var AC = C.Sub(A);
	var AD = D.Sub(A);
	var T = N.Cross(AB);
	
	//Convert the problem to 2D
	var _x0 = 0;
	var _y0 = 0;
	var _x1 = AB.Dot(AB);
	var _y1 = T.Dot(AB);
	var _x2 = AB.Dot(AC);//dot_product_3d(x1 - x0, y1 - y0, z1 - z0, x2 - x0, y2 - y0, z2 - z0);
	var _y2 = T.Dot(AC);//dot_product_3d(t[0], t[1], t[2], x2 - x0, y2 - y0, z2 - z0);
	var _x3 = AB.Dot(AD);//dot_product_3d(x1 - x0, y1 - y0, z1 - z0, x3 - x0, y3 - y0, z3 - z0);
	var _y3 = T.Dot(AD);//dot_product_3d(t[0], t[1], t[2], x3 - x0, y3 - y0, z3 - z0);
	return lines_intersect(_x0, _y0, _x1, _y1, _x2, _y2, _x3, _y3, true);
}
/*
function stile_lines_intersect(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, n)
{
	var t = stile_cross_normalized(n[0], n[1], n[2], x1 - x0, y1 - y0, z1 - z2);
	
	//Convert the problem to 2D
	var _x0 = 0;
	var _y0 = 0;
	var _x1 = dot_product_3d(x1 - x0, y1 - y0, z1 - z0, x1 - x0, y1 - y0, z1 - z0);
	var _y1 = dot_product_3d(t[0], t[1], t[2], x1 - x0, y1 - y0, z1 - z0);
	var _x2 = dot_product_3d(x1 - x0, y1 - y0, z1 - z0, x2 - x0, y2 - y0, z2 - z0);
	var _y2 = dot_product_3d(t[0], t[1], t[2], x2 - x0, y2 - y0, z2 - z0);
	var _x3 = dot_product_3d(x1 - x0, y1 - y0, z1 - z0, x3 - x0, y3 - y0, z3 - z0);
	var _y3 = dot_product_3d(t[0], t[1], t[2], x3 - x0, y3 - y0, z3 - z0);
	return lines_intersect(_x0, _y0, _x1, _y1, _x2, _y2, _x3, _y3, true);
}*/




function stile(x, y, z, nx, ny, nz, radius) constructor
{
	self.x = x;
	self.y = y;
	self.z = z;
	self.nx = nx;
	self.ny = ny;
	self.nz = nz;
	self.r = radius;
}

function stile_smin(a, b, k)
{
	var h = clamp(.5 + .5 * (b - a) / k, 0, 1);
	return lerp(b, a, h) - k * h * (1 - h);
}

function stile_make_orthogonal_vector(nx, ny, nz)
{
	var vx = 1;
	var vy = 1.41;
	var vz = pi;
	var dp = dot_product_3d(vx, vy, vz, nx, ny, nz);
	vx -= nx * dp;
	vy -= ny * dp;
	vz -= nz * dp;
	var v = point_distance_3d(0, 0, 0, vx, vy, vz);
	if (abs(v) <= 0.1)
	{
		vx = pi;
		vy = 1;
		vz = 1.41;
		dp = dot_product_3d(vx, vy, vz, nx, ny, nz);
		vx -= nx * dp;
		vy -= ny * dp;
		vz -= nz * dp;
		v = point_distance_3d(0, 0, 0, vx, vy, vz);
	}
	return [vx / v, vy / v, vz / v];
}

function stile_orthogonalize(vx, vy, vz, nx, ny, nz)
{
	var v = point_distance_3d(0, 0, 0, vx, vy, vz);
	var dp = dot_product_3d(vx, vy, vz, nx, ny, nz);
	vx -= nx * dp;
	vy -= ny * dp;
	vz -= nz * dp;
	var l = point_distance_3d(0, 0, 0, vx, vy, vz);
	if (l <= 0.00001 || l == v)
	{
		return [vx, vy, vz];
	}
	return [vx * v / l, vy * v / l, vz * v / l];
	
	return v.Sub(n.Mul(n.Dot(v))).Normalize();
}

function stile_cross(ax, ay, az, bx, by, bz)
{
	return [ay * bz - by * az, az * bx - bz * ax, ax * by - bx * ay];
}

function stile_cross_normalized(ax, ay, az, bx, by, bz)
{
	var a = point_distance_3d(0, 0, 0, ax, ay, az);
	var b = point_distance_3d(0, 0, 0, bx, by, bz);
	var m = 1 / max(math_get_epsilon(), a * b);
	return [(ay * bz - by * az) * m, (az * bx - bz * ax) * m, (ax * by - bx * ay) * m]
}

function stile_rotate(vx, vy, vz, ax, ay, az, radians) 
{
	var c = cos(radians);
	var s = sin(radians);
	var d = (1 - c) * dot_product_3d(vx, vy, vz, ax, ay, az);
	return [vx * c + ax * d + (ay * vz - az * vy) * s,
			 vy * c + ay * d + (az * vx - ax * vz) * s,
			 vz * c + az * d + (ax * vy - ay * vx) * s];
}
function stile_get_volume_info(spatialhash, xx, yy, zz)
{
	var sumDist = 0;
	var smoothDist = STILE_MAXDIST;
	var minDist = STILE_MAXDIST;
	var region = cm_get_region(spatialhash, [xx, yy, zz, xx, yy, zz]);
	var nx = 0, ny = 0, nz = 0;
	var px = 0, py = 0, pz = 0;
	var closest = 0;
	var i = CM_LIST_NUM;
	repeat (-region[1])
	{
		var sphere = region[i];
		var s = cm_custom_parameter_get(sphere);
		var sphereDist = point_distance_3d(xx, yy, zz, s.x, s.y, s.z) - s.r;
		smoothDist = stile_smin(smoothDist, sphereDist, STILE_SMOOTHRADIUS);
		if (sphereDist < minDist)
		{
			minDist = sphereDist;
			closest = s;
		}
		
		//Find up vector
		var invDist = 1 / max(1., sphereDist);
		sumDist += invDist;
		nx += s.nx * invDist;
		ny += s.ny * invDist;
		nz += s.nz * invDist;
		px += s.x * invDist;
		py += s.y * invDist;
		pz += s.z * invDist;
		
		++i;
	}
	var n = max(0.00001, point_distance_3d(0, 0, 0, nx, ny, nz));
	return 
	{
		dist : smoothDist,
		closest: closest,
		nx : nx / n,
		ny : ny / n,
		nz : nz / n,
		x : px / sumDist,
		y : py / sumDist,
		z : pz / sumDist
	}
}

function stile_add_vertex(vertices, x, y, z, nx, ny, nz, closest)
{
	var num = array_length(vertices);
	array_push(vertices, [x, y, z, nx, ny, nz, closest, num]);
	if (num > 2)
	{
		var v = vertices[0];
		if (point_distance_3d(x, y, z, v[0], v[1], v[2]) < STILE_VERTLENGTH * 1.5)
		{
			return false;
		}
		var v = vertices[1];
		if (point_distance_3d(x, y, z, v[0], v[1], v[2]) < STILE_VERTLENGTH * 1.5)
		{
			return false;
		}
	}
	return true;
}

function vbuff_add_vertex(vbuff, vertex)
{
	vertex_position_3d(vbuff, vertex.x, vertex.y, vertex.z);
	var n = point_distance_3d(0, 0, 0, vertex.nx, vertex.ny, vertex.nz);
	vertex_normal(vbuff, vertex.nx / n, vertex.ny / n, vertex.nz / n);
	vertex_texcoord(vbuff, vertex.tx, vertex.ty);
	vertex_color(vbuff, make_color_rgb(vertex.r, vertex.g, vertex.b), 1);
}

function stile_lerp(A, B, t)
{
	return {
		x: lerp(A.x, B.x, t),
		y: lerp(A.y, B.y, t),
		z: lerp(A.z, B.z, t),
		nx: lerp(A.nx, B.nx, t),
		ny: lerp(A.ny, B.ny, t),
		nz: lerp(A.nz, B.nz, t),
		tx: lerp(A.tx, B.tx, t),
		ty: lerp(A.ty, B.ty, t),
		r: lerp(A.r, B.r, t),
		g: lerp(A.g, B.g, t),
		b: lerp(A.b, B.b, t)};
}

vertex_format_begin();
vertex_format_add_position_3d();
vertex_format_add_normal();
vertex_format_add_texcoord();
vertex_format_add_color();
global.stile_format = vertex_format_end();

//global.stile_colmesh = cm_list();

function stile_bake(stile_array)
{
	var curr = 0;
	var vbuff = [];
	var bakedMap = ds_map_create();
	var num = array_length(stile_array);
	
	//Add all stiles to a spatial hash
	var spatialhash = cm_spatialhash(3 * (STILE_SMOOTHRADIUS + STILE_VERTLENGTH));
	for (var i = 0; i < num; ++i)
	{
		var s = stile_array[i];
		var sphere = cm_sphere(s.x, s.y, s.z, s.r * 2 + STILE_SMOOTHRADIUS * 2);
		cm_add(spatialhash, sphere);
		cm_custom_parameter_set(sphere, s);
	}
	
	for (var i = 0; i < num; ++i)
	{
		var s = stile_array[i];
		if (!is_undefined(bakedMap[? s])){continue;}
		var N = {
			x: 0,
			y: 0,
			z: 0}
		
		var localMap = ds_map_create();
		var good = true;
		
		//Start at the middle of a stile, then work your way outwards until you hit the edge
		var v = stile_make_orthogonal_vector(s.nx, s.ny, s.nz);
		var xx = s.x + s.r * v[0];
		var yy = s.y + s.r * v[1];
		var zz = s.z + s.r * v[2];
		
		//Start ray marching towards the edge
		repeat STILE_MAXREPETITIONS
		{
			var d = stile_get_volume_info(spatialhash, xx, yy, zz);
			if (abs(d.dist) < STILE_MINDIST){break;}
			
			var p = stile_orthogonalize(xx + d.dist * v[0] - d.x, yy + d.dist * v[1] - d.y, zz + d.dist * v[2] - d.z, d.nx, d.ny, d.nz);
			xx = d.x + p[0];
			yy = d.y + p[1];
			zz = d.z + p[2];
		}
		
		//Add a vertex
		var vertices = [];
		
		//Start following the border
		v = stile_cross(v[0], v[1], v[2], d.nx, d.ny, d.nz);
		var l = point_distance_3d(0, 0, 0, v[0], v[1], v[2]);
		v[0] /= l;
		v[1] /= l;
		v[2] /= l;
		var n = 0;
		repeat 2000
		{
			var k = 0;
			repeat STILE_MAXREPETITIONS
			{
				var substeps = 4;
				var probeDist = STILE_VERTLENGTH / substeps;
				var _x = xx + v[0] * probeDist;
				var _y = yy + v[1] * probeDist;
				var _z = zz + v[2] * probeDist;
				var d = stile_get_volume_info(spatialhash, _x, _y, _z);
				if (abs(d.dist) < STILE_MINDIST && k++ > 0)
				{
					break;
				}
				v = stile_rotate(v[0], v[1], v[2], d.nx, d.ny, d.nz, d.dist / probeDist);
				v = stile_orthogonalize(v[0], v[1], v[2], d.nx, d.ny, d.nz);
				var l = point_distance_3d(0, 0, 0, v[0], v[1], v[2]);
				v[0] /= l;
				v[1] /= l;
				v[2] /= l;
			}
			var p = stile_orthogonalize(_x - d.x, _y - d.y, _z - d.z, d.nx, d.ny, d.nz);
			xx = d.x + p[0];
			yy = d.y + p[1];
			zz = d.z + p[2];
			if (++n < 4)
			{
				continue;
			}
			n = 0;
			if (!is_undefined(bakedMap[? d.closest]))
			{
				good = false;
			}
			localMap[? d.closest] = true;
			N.x += d.nx;
			N.y += d.ny;
			N.z += d.nz;
			if (!stile_add_vertex(vertices, xx, yy, zz, d.nx, d.ny, d.nz, d.closest))
			{
				break;
			}
		}
		ds_map_copy(bakedMap, localMap);
		ds_map_destroy(localMap);
		
		var verts = array_length(vertices)
		if (verts <= 1 || !good)
		{
			--curr;
			continue;
		}
		
		var n = point_distance_3d(0, 0, 0, N.x, N.y, N.z);
		N.x /= n;
		N.y /= n;
		N.z /= n;
		
		var polygon = [];
		
		vbuff[curr] = vertex_create_buffer();
		vbuff[curr+1] = vertex_create_buffer();
		vbuff[curr+2] = vertex_create_buffer();
		var edge = vbuff[curr];
		var center = vbuff[curr+1];
		var side = vbuff[curr+2];
		curr += 3;
		
		vertex_begin(edge, global.stile_format);
		vertex_begin(center, global.stile_format);
		vertex_begin(side, global.stile_format);
		for (var j = 0; j < verts + 1; j ++)
		{
			var tx1 = frac((j * STILE_VERTLENGTH) / STILE_TEXLENGTH);
			var tx2 = tx1 + STILE_VERTLENGTH / STILE_TEXLENGTH;
			
			var va = vertices[j mod verts];
			
			var B = stile_get_volume_info(spatialhash, va[0], va[1], va[2]);
			var d = point_distance_3d(B.x, B.y, B.z, va[0], va[1], va[2]);
			var t = clamp(1 - STILE_TEXHEIGHT / d / 2, 0, 1);
			B.x = lerp(B.x, va[0], t);
			B.y = lerp(B.y, va[1], t);
			B.z = lerp(B.z, va[2], t);
			B.tx = tx1;
			B.ty = 0;
			B.r = 1;
			B.g = 1;
			B.b = 1;
			
			var d = point_distance_3d(B.x, B.y, B.z, va[0], va[1], va[2]);
			var A = {
				x: va[0],
				y: va[1],
				z: va[2],
				nx: va[3] + (va[0] - B.x) / d / 2,
				ny: va[4] + (va[1] - B.y) / d / 2,
				nz: va[5] + (va[2] - B.z) / d / 2,
				tx: tx1,
				ty: .5,
				r: 1,
				g: 1,
				b: 1}
				
			var vc = vertices[(j + 1) mod verts];
			var D = stile_get_volume_info(spatialhash, vc[0], vc[1], vc[2]);
			var d = point_distance_3d(D.x, D.y, D.z, vc[0], vc[1], vc[2]);
			var t = clamp(1 - STILE_TEXHEIGHT / d / 2, 0, 1);
			D.x = lerp(D.x, vc[0], t);
			D.y = lerp(D.y, vc[1], t);
			D.z = lerp(D.z, vc[2], t);
			D.tx = tx2;
			D.ty = 0;
			D.r = 1;
			D.g = 1;
			D.b = 1;
				
			var d = point_distance_3d(D.x, D.y, D.z, vc[0], vc[1], vc[2]);
			var C = {
				x: vc[0],
				y: vc[1],
				z: vc[2],
				nx: vc[3] + (vc[0] - D.x) / d / 2,
				ny: vc[4] + (vc[1] - D.y) / d / 2,
				nz: vc[5] + (vc[2] - D.z) / d / 2,
				tx: tx2,
				ty: .5,
				r: 1,
				g: 1,
				b: 1}
			
			array_push(polygon, B);
			
			vbuff_add_vertex(edge, A);
			vbuff_add_vertex(edge, C);
			vbuff_add_vertex(edge, B);
			//cm_add(global.stile_colmesh, cm_triangle(true, A.x, A.y, A.z, C.x, C.y, C.z, B.x, B.y, B.z));
			
			vbuff_add_vertex(edge, B);
			vbuff_add_vertex(edge, C);
			vbuff_add_vertex(edge, D);
			//cm_add(global.stile_colmesh, cm_triangle(true, B.x, B.y, B.z, C.x, C.y, C.z, D.x, D.y, D.z));
			
			var _B = A;
			var _D = C;
			var _A = stile_lerp(B, A, 1.8);
			var _C = stile_lerp(D, C, 1.8);
			_A.x -= va[3] * STILE_TEXHEIGHT / 2;
			_A.y -= va[4] * STILE_TEXHEIGHT / 2;
			_A.z -= va[5] * STILE_TEXHEIGHT / 2;
			_C.x -= vc[3] * STILE_TEXHEIGHT / 2;
			_C.y -= vc[4] * STILE_TEXHEIGHT / 2;
			_C.z -= vc[5] * STILE_TEXHEIGHT / 2;
			vbuff_add_vertex(edge, _A);
			vbuff_add_vertex(edge, _C);
			vbuff_add_vertex(edge, _B);
			
			vbuff_add_vertex(edge, _B);
			vbuff_add_vertex(edge, _C);
			vbuff_add_vertex(edge, _D);
			
			//Make the side of the platform
			_A = A;
			_C = C;
			_B = stile_lerp(A, B, 3);
			_D = stile_lerp(C, D, 3);
			_B.x -= va[3] * STILE_PLATFORM_HEIGHT;
			_B.y -= va[4] * STILE_PLATFORM_HEIGHT;
			_B.z -= va[5] * STILE_PLATFORM_HEIGHT;
			var d = point_distance_3d(A.x, A.y, A.z, B.x, B.y, B.z);
			_B.nx = (A.x - B.x) / d - va[3] * .5;
			_B.ny = (A.y - B.y) / d - va[4] * .5;
			_B.nz = (A.z - B.z) / d - va[5] * .5;
			_A.nx = _B.nx;
			_A.ny = _B.ny;
			_A.nz = _B.nz;
			_D.x -= vc[3] * STILE_PLATFORM_HEIGHT;
			_D.y -= vc[4] * STILE_PLATFORM_HEIGHT;
			_D.z -= vc[5] * STILE_PLATFORM_HEIGHT;
			var d = point_distance_3d(C.x, C.y, C.z, D.x, D.y, D.z);
			_D.nx = (C.x - D.x) / d - va[3] * .5;
			_D.ny = (C.y - D.y) / d - va[4] * .5;
			_D.nz = (C.z - D.z) / d - va[5] * .5;
			_C.nx = _D.nx;
			_C.ny = _D.ny;
			_C.nz = _D.nz;
			
			vbuff_add_vertex(side, _A);
			vbuff_add_vertex(side, _B);
			vbuff_add_vertex(side, _C);
			//cm_add(global.stile_colmesh, cm_triangle(true, _A.x, _A.y, _A.z, _B.x, _B.y, _B.z, _C.x, _C.y, _C.z));
			
			vbuff_add_vertex(side, _B);
			vbuff_add_vertex(side, _D);
			vbuff_add_vertex(side, _C);
			//cm_add(global.stile_colmesh, cm_triangle(true, _B.x, _B.y, _B.z, _D.x, _D.y, _D.z, _C.x, _C.y, _C.z));
		}
		
		stile_bake_center(center, polygon, N);
		
		vertex_end(edge);
		vertex_end(center);
		vertex_end(side);
		
		break;
	}
	
	ds_map_destroy(bakedMap);
	return vbuff;
}
/*
function stile_point_in_triangle(px, py, pz, x0, y0, z0, x1, y1, z1, x2, y2, z2, n)
{
	var e;
	
	//Check each edge
	e = stile_cross(px - x0, py - y0, pz - z0, x1 - x0, y1 - y0, z1 - z0);
	if (dot_product_3d(n[0], n[1], n[2], e[0], e[1], e[2]) < 0){return false;}
	
	e = stile_cross(px - x1, py - y1, pz - z1, x2 - x1, y2 - y1, z2 - z1);
	if (dot_product_3d(n[0], n[1], n[2], e[0], e[1], e[2]) < 0){return false;}
	
	e = stile_cross(px - x2, py - y2, pz - z2, x0 - x2, y0 - y2, z0 - z2);
	if (dot_product_3d(n[0], n[1], n[2], e[0], e[1], e[2]) < 0){return false;}
	
	return true;
}*/



function stile_bake_center(vbuff, polygon, N)
{
	var t = stile_make_orthogonal_vector(N.x, N.y, N.z);
	var T1 = {x: t[0], y: t[1], z: t[2]};
	var t = stile_cross_normalized(T1.x, T1.y, T1.z, N.x, N.y, N.z);
	var T2 = {x: t[0], y: t[1], z: t[2]};
	var polygonSize = array_length(polygon);
	
	//Delete the last polygon since it's guaranteed to be the same as the first
	array_delete(polygon, --polygonSize, 1);
	
	//Loop through all the polygons
	for (var n = polygonSize; n > 3; --n)
	{
		
		var minDist = 999999;
		var bestA = -1;
		var bestB = -1;
		var bestC = -1;
		for (var a = 0; a < min(n, 100); ++a)
		{
			//Pick the next two points
			var b = (a + 1) mod n;
			var c = (a + 2) mod n;
			
			//Make a triangle with the selected points
			var A = polygon[a];
			var B = polygon[b];
			var C = polygon[c];
			
			//Make sure the triangle is counter-clockwise compared to the up vector
			var w = stile_cross(B.x - A.x, B.y - A.y, B.z - A.z, C.x - A.x, C.y - A.y, C.z - A.z);
			if (dot_product_3d(w[0], w[1], w[2], N.x, N.y, N.z) > 0)
			{
				var good = true;
				
				
				for (var i = 0; i < n; ++i)
				{
					if (i == a || i == b || i == c){continue;}
					var D = polygon[i];
					
					//Make sure the triangle has no vertices inside it
					if stile_point_in_triangle(D.x, D.y, D.z, A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z, w)
					{
						//show_debug_message("Verts inside");
						good = false;
						break;
					}		
					
					//Make sure the new edge does not have any other edges crossing it
					var j = (i + 1) mod n;
					if (j == a || j == b || j == c){continue;}
					var E = polygon[j];
					
					if (stile_lines_intersect(A.x, A.y, A.z, C.x, C.y, C.z, D.x, D.y, D.z, E.x, E.y, E.z, w))
					{
						//show_debug_message("Lines intersect");
						good = false;
						break;
					}
				}
				
				//Add the triangle and remove the unshared vertex
				if (good)
				{
					var dist = point_distance_3d(A.x, A.y, A.z, C.x, C.y, C.z);
					if (dist < minDist)
					{
						minDist = dist;
						bestA = a;
						bestB = b;
						bestC = c;
					}
				}
			}//else{show_debug_message("Normal not good");}				
		}
		if (bestA < 0){continue;}
		
		var A = polygon[bestA];
		var B = polygon[bestB];
		var C = polygon[bestC];
		
		var tx = dot_product_3d(A.x, A.y, A.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH;
		var ty = dot_product_3d(A.x, A.y, A.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH;
		vertex_position_3d(vbuff, A.x, A.y, A.z);
		vertex_normal(vbuff, A.nx, A.ny, A.nz);
		vertex_texcoord(vbuff, frac(tx), frac(ty));
		vertex_color(vbuff, c_white, 1);
				
		vertex_position_3d(vbuff, B.x, B.y, B.z);
		vertex_normal(vbuff, B.nx, B.ny, B.nz);
		vertex_texcoord(vbuff, dot_product_3d(B.x, B.y, B.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH - floor(tx), dot_product_3d(B.x, B.y, B.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH - floor(ty));
		vertex_color(vbuff, c_white, 1);
					
		vertex_position_3d(vbuff, C.x, C.y, C.z);
		vertex_normal(vbuff, C.nx, C.ny, C.nz);
		vertex_texcoord(vbuff, dot_product_3d(C.x, C.y, C.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH - floor(tx), dot_product_3d(C.x, C.y, C.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH - floor(ty));
		vertex_color(vbuff, c_white, 1);
		
		
		//cm_add(global.stile_colmesh, cm_triangle(true, A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z));
					
		array_delete(polygon, bestB, 1);
	}
	var A = polygon[0];
	var B = polygon[1];
	var C = polygon[2];
	var w = stile_cross(B.x - A.x, B.y - A.y, B.z - A.z, C.x - A.x, C.y - A.y, C.z - A.z);
	if (dot_product_3d(w[0], w[1], w[2], N.x, N.y, N.z) < 0)
	{
		var _C = B;
		B = C;
		C = _C;
	}
	
	var tx = dot_product_3d(A.x, A.y, A.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH;
	var ty = dot_product_3d(A.x, A.y, A.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH;
	vertex_position_3d(vbuff, A.x, A.y, A.z);
	vertex_normal(vbuff, A.nx, A.ny, A.nz);
	vertex_texcoord(vbuff, frac(tx), frac(ty));
	vertex_color(vbuff, c_white, 1);
				
	vertex_position_3d(vbuff, B.x, B.y, B.z);
	vertex_normal(vbuff, B.nx, B.ny, B.nz);
	vertex_texcoord(vbuff, dot_product_3d(B.x, B.y, B.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH - floor(tx), dot_product_3d(B.x, B.y, B.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH - floor(ty));
	vertex_color(vbuff, c_white, 1);
					
	vertex_position_3d(vbuff, C.x, C.y, C.z);
	vertex_normal(vbuff, C.nx, C.ny, C.nz);
	vertex_texcoord(vbuff, dot_product_3d(C.x, C.y, C.z, T1.x, T1.y, T1.z) / STILE_TEXLENGTH - floor(tx), dot_product_3d(C.x, C.y, C.z, T2.x, T2.y, T2.z) / STILE_TEXLENGTH - floor(ty));
	vertex_color(vbuff, c_white, 1);
	
	
	//cm_add(global.stile_colmesh, cm_triangle(true, A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z));
}







