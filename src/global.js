
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
    }
});

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


function uvsOnSave(uvs) { 
    if (!settings["normalized_uvs"].value) return uvs
    uvs[0] /= Project.texture_width
    uvs[1] /= Project.texture_height
    clamp(uvs[0], 0, 1)
    clamp(uvs[1], 0, 1)
    return uvs
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
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

function meshToPolyMesh(poly_mesh, mesh) {
    const poly_mesh_template = {
		normalized_uvs: settings["normalized_uvs"].value,
        positions: [],
		normals: [],
        uvs: [],
        polys: []
    };
    poly_mesh ??= poly_mesh_template;
	const vKeysToIndex = {};
    let positions = Object.entries(mesh.vertices).map(([key, position], index) => {
        vKeysToIndex[key] = index + poly_mesh.positions.length;
        return position;
    });

    let polys = [];
	polys = Object.values(mesh.faces)
	
	polys = polys.map( (/** @type {MeshFace} */ face ) => { 
		
		return face.vertices.map( (vertexKey) => {
			let nIndex = -1;
			let uIndex = -1;
            
            const uv = uvsOnSave([face.uv[vertexKey][0], face.uv[vertexKey][1]])
            
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
    const tri_size = settings["triangulate_quads"].value ? 3 : 4;

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
    polys = polys.map((poly) => [ poly[0], poly[1], poly[2], poly[3] ?? poly[2] ]);
    poly_mesh.polys.push(...polys);
    poly_mesh.positions.push(...positions);
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