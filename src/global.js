
Plugin.register('meshy', {
	title: 'Meshy',
	author: 'Shadowkitten47',
	icon: 'diamond',
	description: 'Loads meshy',
	version: '1.0.0',
	variant: 'both',
    onload() {
        if (BarItems['add_mesh']) {
            addMesh = BarItems['add_mesh']
            addMesh.condition = { modes: ['edit'], method: () => (["bedrock", "bedrock"].includes(Format.id)) }
        }
        else console.warn('Error')
    }
});

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}
function translatePoint(point, center) {
    return point.map((coord, i) => coord + center[i]);
}
function rotatePoint(point, center, rotation) {
    // Convert rotation angles to radians
    const [rx, ry, rz] = rotation.map(toRadians);

    // Translate point to origin
    let [x, y, z] = point.map((coord, i) => coord - center[i]);

    // Rotate around X-axis
    let temp = y;
    y = y * Math.cos(rx) - z * Math.sin(rx);
    z = temp * Math.sin(rx) + z * Math.cos(rx);

    // Rotate around Y-axis
    temp = x;
    x = x * Math.cos(ry) + z * Math.sin(ry);
    z = -temp * Math.sin(ry) + z * Math.cos(ry);

    // Rotate around Z-axis
    temp = x;
    x = x * Math.cos(rz) - y * Math.sin(rz);
    y = temp * Math.sin(rz) + y * Math.cos(rz);

    // Translate back
    return [
        x + center[0],
        y + center[1],
        z + center[2]
    ];
}

function meshToPolyMesh(mesh, ) {
    const poly_mesh = {
		normalized_uvs: true,
        positions: [],
		normals: [],
        uvs: [],
        polys: []
    };

	const vKeysToIndex = {};
    poly_mesh.positions =  poly_mesh.positions = Object.entries(mesh.vertices).map(([key, position], index) => {
        vKeysToIndex[key] = index;
        return position;
    });

	poly_mesh.polys = Object.values(mesh.faces)
	
	poly_mesh.polys = poly_mesh.polys.map( (/** @type {MeshFace} */ face ) => { 
		
		return face.vertices.map( (vertexKey) => {
			let nIndex = -1;
			let uIndex = -1;
            
            const uv = [face.uv[vertexKey][0] / Project.texture_width, face.uv[vertexKey][1] / Project.texture_height]
			if (indexFindArr(poly_mesh.uvs, uv) === -1 ) {
				poly_mesh.uvs.push(uv);
				uIndex = poly_mesh.uvs.length - 1;
			}
			else uIndex = indexFindArr(poly_mesh.uvs, uv) 

			const normal = face.getNormal(true)
			if (indexFindArr(poly_mesh.normals, normal) === -1) {
				poly_mesh.normals.push(normal)
                nIndex = poly_mesh.uvs.length - 1;
			}
			else nIndex = indexFindArr(poly_mesh.normals, normal)

			return [ vKeysToIndex[vertexKey], nIndex, uIndex ];
		});
	})
	poly_mesh.polys.forEach((face, i) => { //Split to triangles if needed
		if (face.length > 4) { 
            poly_mesh.polys.splice(i, 1)
            for (let j = 1; j < face.length - 1; j++) {
                poly_mesh.polys.push([ face[0], face[j], face[j + 1] ])
            }
        }
	})
    poly_mesh.polys.forEach((face, i) => { //Convert to quads remove if tri gets fixed
        poly_mesh.polys[i] = [face[0], face[1], face[2], face[3] ?? face[2]]
    })
    return poly_mesh;
}

function transforMesh(mesh) {
	mesh.vertices = Object.entries(mesh.vertices).map( ([key, point ]) => {
		point = rotatePoint(point, mesh.origin, mesh.rotation) //Rotate
        point = translatePoint(point, mesh.origin)

		return [ key, point ]
	}) 
	mesh.vertices = Object.fromEntries(mesh.vertices)
	mesh.origin = [0,0,0] //Reset
	mesh.rotation = [0,0,0]//Reset
    mesh.updateElement()
	return mesh
}

function indexFindArr (arr1, arr2) {
    return arr1.findIndex(arr => 
        Array.isArray(arr) && 
        arr.length === arr.length && 
        arr.every((element, index) => element === arr2[index])
    );
}

function parsePolyMesh(b, group) {
    const base_mesh = new Mesh({name: b.name, autouv: 0, color: group.color, vertices: []});
    base_mesh.vertices = b.poly_mesh.positions.reduce((acc, curr, i) => {
        acc[`v${i}`] = curr;
        return acc;
    }, {});
    const faces = b.poly_mesh.polys.map((poly) => {
        //Convert to tri if needed Remove if tri gets fixed
        if (poly[3] === poly[2]) {
            poly.pop()
        }
        const uvScale = b.poly_mesh.normalized_uvs == true ? [ Project.texture_width, Project.texture_height ] : [ 1, 1 ] 
        const ver = poly.map((i) => `v${i[0]}`)
        let uvs = poly.map((i) => i[2])
        uvs = uvs.reduce((acc, curr, i) => {
            acc[ver[i]] = [ b.poly_mesh.uvs[curr][0] * uvScale[0], b.poly_mesh.uvs[curr][1] * uvScale[1] ];
            return acc;
        }, {})
        return new MeshFace(base_mesh, { vertices: ver, uv: uvs })
    })
    base_mesh.addFaces(...faces)
    base_mesh.addTo(group).init()
}

//The following code is from blockbench source code with slight modifications
//Most code that is unqiue to this project is above
//And are shared function between bedrock_old and bedrock in witch no major changes are made