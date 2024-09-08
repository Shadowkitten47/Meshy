Plugin.register('meshy', {
	title: 'Meshy',
	author: 'Shadowkitten47',
	icon: 'diamond',
	description: 'Loads meshy',
	version: '1.0.0',
	variant: 'both',
    onload() {
        console.log("Meshy loaded")
        const bedrock_old = Formats['bedrock_old']
        const bedrock = Formats['bedrock']
        bedrock.meshes = true;
        bedrock_old.meshes = true;
    },
    onunload() {
        const bedrock_old = Formats['bedrock_old']
        const bedrock = Formats['bedrock']
        bedrock.meshes = false;
        bedrock_old.meshes = false;
    }
});


    new Worker(function () {
    console.log("Hello")
  });
//#region Settings
if (!settings["normalized_uvs"])
    new Setting("normalized_uvs", {
        name: "Normalize UVs",
        description: "Normalize uvs on export",
        value: true,
        plugin: "meshy"
    })
if (!settings["triangulate_quads"])
        new Setting("triangulate_quads", {
        name: "Triangulate Quads",
        description: "Triangulate quads on export | Quads sometimes act funny this may fix it",
        value: true,
        plugin: "meshy"
    })
//#endregion

function uvsOnSave(uvs) { 
    uvs[1] = Project.texture_height - uvs[1]
    if (!settings["normalized_uvs"].value) return uvs
    uvs[0] /= Project.texture_width
    uvs[1] /= Project.texture_height
    clamp(uvs[0], 0, 1)
    clamp(uvs[1], 0, 1)
    return uvs
}

function mesh_to_polymesh(poly_mesh, mesh) {
    const poly_mesh_template = {
        meta: {
            meshes: []
        },
		normalized_uvs: settings["normalized_uvs"].value,
        positions: [],
		normals: [],
        uvs: [],
        polys: []
    };
    poly_mesh ??= poly_mesh_template;

    //Meta Data for mesh to be exported
    //Minecraft doesn't support multiple meshes under the same group
    //So we combine all meshes into one mesh the meta data is to recover the original meshes
    const mesh_meta = {
        name: mesh.name,
        //No postion only origin
        origin: mesh.origin,
        rotation: mesh.rotation,
        start: poly_mesh.polys.length,
    }


	const vKeysToIndex = {};
    const vKeyToNormalIndex = {};

    //Apply rotaion and translation and return without changing original object
    let positions = getVertices(mesh).map(([key, position], index) => {
        vKeysToIndex[key] = index + poly_mesh.positions.length;
        return position;
    });
    let normals = []

    let polys = [];
	polys = Object.values(mesh.faces)

	polys = polys.map( (/** @type {MeshFace} */ face ) => { 
		return face.getSortedVertices().map( (vertexKey) => {
			let nIndex = -1;
			let uIndex = -1;
            
            const uv = uvsOnSave([face.uv[vertexKey][0], face.uv[vertexKey][1]])
			if (indexFindArr(poly_mesh.uvs, uv) === -1 ) {
				poly_mesh.uvs.push(uv);
				uIndex = poly_mesh.uvs.length - 1;
			}
			else uIndex = indexFindArr(poly_mesh.uvs, uv) 

            if (!vKeyToNormalIndex[vertexKey]) { //Check if normal has been added to the vertex
                const normal = getVertexNormal(mesh, vertexKey);
                const index = indexFindArr(poly_mesh.normals, normal);
                if (index === -1 ) { //Check if normal is already in the array
                    poly_mesh.normals.push(normal);
                    vKeyToNormalIndex[vertexKey] = poly_mesh.normals.length - 1
                }
                else {
                    vKeyToNormalIndex[vertexKey] = index;
                }
            }
			nIndex = vKeyToNormalIndex[vertexKey];

			return [ vKeysToIndex[vertexKey], nIndex, uIndex ];
		});
	})

    
    const tri_size = 3;
    const temp_polys = [...polys]
    polys = [];
	for (let i in temp_polys) {
        if (!Array.isArray(temp_polys[i])) continue;
        if (temp_polys[i].length > tri_size) {
            for (let j = 1; j < temp_polys[i].length - 1; j++) {
                polys.push([ temp_polys[i][0], temp_polys[i][j], temp_polys[i][j + 1] ])
            }
        }
        else polys.push(temp_polys[i])
    }

    mesh_meta.length = polys.length;

    poly_mesh.meta.meshes.push(mesh_meta);
    polys = polys.map((poly) => [ poly[0], poly[1], poly[2], poly[3] ?? poly[2] ]);
    poly_mesh.polys.push(...polys);
    poly_mesh.positions.push(...positions);
    return poly_mesh;
}


//Gets vertices and applys nessary transformations
function getVertices(mesh) {
	const verts = Object.entries(mesh.vertices).map( ( [key, point ]) => {
		point = rotatePoint(point, mesh.origin, mesh.rotation)
        point = translatePoint(point, mesh.position)
		return [ key, point ]
	}) 
	return verts;
}

function polymesh_to_mesh(b, group) {
    if (b.poly_mesh.meta) {
        for (let mesh of b.poly_mesh.meta.meshes) {
            const base_mesh = new Mesh({name: mesh.name, autouv: 0, color: group.color, vertices: []});
            const polys = b.poly_mesh.polys.slice(mesh.start, mesh.start + mesh.length);
            const org = multiplyScalar(mesh.origin, -1);
            const rot = multiplyScalar(mesh.rotation, -1);
            for ( let face of polys ) {
                const unique = [];
                for (let i = 0; i < face.length; i++) {
                    if (indexFindArr(unique, face[i]) === -1) {
                        unique.push(face[i]);
                    }
                }
                face = unique;
                const vertices = []
                const uv = {}
                for (let vertex of face ) {
                    //Moves points back to original position refer to getVertices
                    const point = rotatePoint( translatePoint(b.poly_mesh.positions[vertex[0]], org), mesh.origin, rot)
                    base_mesh.vertices[`v${vertex[0]}`] = point;
                    vertices.push(`v${vertex[0]}`)
                    const uv1 = ( b.poly_mesh.normalized_uvs ? b.poly_mesh.uvs[vertex[2]][0] * Project.texture_width : b.poly_mesh.uvs[vertex[2]][0] );
                    const uv2 = ( b.poly_mesh.normalized_uvs ? Project.texture_height - (b.poly_mesh.uvs[vertex[2]][1] * Project.texture_height) : Project.texture_height - b.poly_mesh.uvs[vertex[2]][1] );
                    uv[`v${vertex[0]}`] = [ uv1, uv2 ];
                }
                base_mesh.addFaces(new MeshFace(base_mesh, { vertices, uv }));
            }
            base_mesh.origin = mesh.origin;
            base_mesh.rotation = mesh.rotation;
            base_mesh.addTo(group).init();
        }
    }
    else {
        const base_mesh = new Mesh({name: b.name, autouv: 0, color: group.color, vertices: []});
        for ( let face of b.poly_mesh.polys ) {
            const unique = [];
            for (let i = 0; i < face.length; i++) {
                if (indexFindArr(unique, face[i]) === -1) {
                    unique.push(face[i]);
                }
            }
            face = unique;
            const vertices = []
            const uv = {}
            for (let vertex of face ) {
                base_mesh.vertices[`v${vertex[0]}`] = b.poly_mesh.positions[vertex[0]];
                vertices.push(`v${vertex[0]}`)
                const uv1 = ( b.poly_mesh.normalized_uvs ? b.poly_mesh.uvs[vertex[2]][0] * Project.texture_width : b.poly_mesh.uvs[vertex[2]][0] );
                const uv2 = ( b.poly_mesh.normalized_uvs ? Project.texture_height - (b.poly_mesh.uvs[vertex[2]][1] * Project.texture_height) : b.poly_mesh.uvs[vertex[2]][1] );
                uv[`v${vertex[0]}`] = [ uv1, uv2 ];
            }
            base_mesh.addFaces(new MeshFace(base_mesh, { vertices, uv }));
        }
        base_mesh.addTo(group).init();
    }
}

//#region Helpers

function getVertexNormal(mesh, vertexKey) {
    let normalSum = [0, 0, 0];
    let faceCount = 0;

    for (let faceKey in mesh.faces) {
        let face = mesh.faces[faceKey];
        if (face.vertices.includes(vertexKey)) {
            let faceNormal = face.getNormal();
            normalSum[0] += faceNormal[0];
            normalSum[1] += faceNormal[1];
            normalSum[2] += faceNormal[2];
            faceCount++;
        }
    }

    let normalLength = Math.sqrt(normalSum[0] * normalSum[0] + normalSum[1] * normalSum[1] + normalSum[2] * normalSum[2]);
    if (normalLength === 0) {
        return [0, 1, 0]; // Default to up vector if normal is zero
    }
    return [
        normalSum[0] / normalLength,
        normalSum[1] / normalLength,
        normalSum[2] / normalLength
    ];
}

function multiplyScalar(vec, scalar) {
    return vec.map((coord) => coord * scalar);
}
function indexFindArr(arr1, arr2) {
    return arr1.findIndex(arr => 
        Array.isArray(arr) && 
        arr.length === arr.length && 
        arr.every((element, index) => element === arr2[index])
    );
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

//Minecraft polys_lack and overall pos and rotation
//So we need to apply them to each vertex on export
function translatePoint(point, center) {
    return [ point[0] - center[0], point[1] + center[1], point[2] + center[2] ];
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
//#endregion

//The following code is from blockbench source code with slight modifications
//Most code that is unqiue to this project is above
//And are shared function between bedrock_old and bedrock in witch no major changes are made
