


//#region Save Functions
/**
 * Converts a mesh to a polymesh.
 * @param {Object} poly_mesh The polymesh to save to. If not defined, a new polymesh will be created.
 * @param {Mesh} mesh The mesh to save.
 * @returns {Object} The polymesh with the mesh saved to it.
 */
function compileMesh(poly_mesh, mesh) {
    poly_mesh ??= 
    {
        meta: settings["meta_data"].value ? 
        {
            meshes: [],
        } : undefined,
		normalized_uvs: settings["normalized_uvs"].value,
        positions: [],
		normals: [],
        uvs: [],
        polys: []
    };

    //vertex keys -> value
	const postionMap = new Map();
    const normalMap = new Map();
    const uvMap = new Map();
    const vertexFacesMap = new Map();

    //normal arr -> value
    const normals = new Map();

    //Make a map of faces a vertex is appart of 
    for (let faceKey in mesh.faces) {
        let face = mesh.faces[faceKey];
        for (let vertexKey of face.vertices) {
            if (!vertexFacesMap.has(vertexKey)) {
                vertexFacesMap.set(vertexKey, []);
            }
            vertexFacesMap.get(vertexKey).push(faceKey);
        }
    }

    for (let [key, pos] of getVertices(mesh)) {
        postionMap.set(key, poly_mesh.positions.length);
        poly_mesh.positions.push(pos);

        const normal = getVertexNormal(mesh, key, vertexFacesMap);

        if (!normals.has(normal)) {
            normalMap.set(key, poly_mesh.normals.length);
            normals.set(normal, poly_mesh.normals.length);
            poly_mesh.normals.push(normal);
        }
        else normalMap.set(key, normals.get(normal))
    }

	
    let polys = Object.values(mesh.faces).map((face) => {
        const poly = face.getSortedVertices().map((vertexKey) => {
            const [u, v] = face.uv[vertexKey];
            const uv = uvsOnSave([u, v]);
            const uIndex = uvMap.get(uv.toString()) ?? (() => {
                const index = poly_mesh.uvs.length;
                poly_mesh.uvs.push(uv);
                uvMap.set(uv.toString(), index);
                return index;
            })();

            return [postionMap.get(vertexKey), normalMap.get(vertexKey), uIndex];
        });
        if (poly.length < 4) poly.push(poly[2]);
        return poly;
    });

    if (settings["meta_data"].value) {
        //Meta Data for mesh to be exported
        //Minecraft doesn't support multiple meshes under the same group
        //So we combine all meshes into one mesh the meta data is to recover the original meshes
        const mesh_meta = {
            name: mesh.name,
            //No postion only origin
            position: mesh.position,
            origin: mesh.origin,
            rotation: mesh.rotation,
            start: poly_mesh.polys.length,
            length: polys.length
        }
        poly_mesh.meta.meshes.push(mesh_meta);
    }
    //Spread opertator fails here due to an Range Error with a super high face count ( ~200k )
    //+ is faster for super large meshs
    for (let poly of polys) poly_mesh.polys.push(poly);
    return poly_mesh;
}
function uvsOnSave(uvs) { 
    uvs[1] = Project.texture_height - uvs[1] //Invert y axis
    if (!settings["normalized_uvs"].value) return uvs
    uvs[0] /= Project.texture_width
    uvs[1] /= Project.texture_height
    Math.clamp(uvs[0], 0, 1)
    Math.clamp(uvs[1], 0, 1)
    return uvs
}
//#endregion

//Gets vertices and applys nessary transformations
//#region Load Functions
function getVertices(mesh) {
	const verts = Object.entries(mesh.vertices).map( ( [key, point ]) => {
		point = rotatePoint(point, mesh.origin, mesh.rotation)
        point.V3_add(-mesh.position[0], mesh.position[1], mesh.position[2])
		return [ key, point ]
	}) 
	return verts;
}

function parseMesh(b, group) {
    /**
     * Adds meta data to mesh. This is to recover the original objects after exporting
     * sense only one can be save to a group at a time this also used for saving the rotation and position.
     */
    if (b.poly_mesh.meta) {
        for (let meta of b.poly_mesh.meta.meshes) {
            const mesh = new Mesh({name: b.name, autouv: 0, color: group.color, vertices: []});
            meta.position ??= [0, 0, 0];
            meta.rotation ??= [0, 0, 0];
            meta.origin ??= [0, 0, 0];
            const polys = b.poly_mesh.polys.slice(meta.start, meta.start + meta.length);
            for ( let face of polys ) {
                const unique = new Set();
                const vertices = []
                const uvs = {}
                for (let point of face ) {

                    //Make sure we don't add the same vertex twice ( This means that a quad was folded in half )
                    if (unique.has(point.toString())) continue;
                    unique.add(point.toString());

                    //Do the transformations to revert the vertices
                    const postion = rotatePoint(b.poly_mesh.positions[point[0]].V3_add(meta.position[0], -meta.position[1], -meta.position[2]), meta.origin, multiplyScalar(meta.rotation, -1));
                    //Save the point to the mesh
                    mesh.vertices[String(point[0])] = postion;
                    vertices.push(String(point[0]));

                    const uv = b.poly_mesh.uvs[point[2]]
                    uv[1] = Project.texture_height - uv[1]  //Invert y axis
                    if (b.poly_mesh.normalized_uvs) { 
                        uv.V2_multiply(Project.texture_width, Project.texture_height)
                    }
                    uvs[String(point[0])] = uv;

                }
                mesh.addFaces(new MeshFace(mesh, { vertices, uvs }));
            }
            mesh.origin = meta.origin;
            mesh.rotation = meta.rotation;            
            mesh.addTo(group).init();
        }
    }
    else {
        const mesh = new Mesh({name: b.name, autouv: 0, color: group.color, vertices: []});
        for ( let face of b.poly_mesh.polys ) {
            const unique = new Set();
            const vertices = []
            const uvs = {}
            for (let point of face ) {
                if (unique.has(point.toString())) continue;
                unique.add(point.toString());

                const postion = b.poly_mesh.positions[point[0]]
                mesh.vertices[String(point[0])] = postion;
                vertices.push(String(point[0]));
                const uv = b.poly_mesh.uvs[point[2]]
                uv[1] = Project.texture_height - uv[1]  //Invert y axis
                if (b.poly_mesh.normalized_uvs) { 
                    uv.V2_multiply(Project.texture_width, Project.texture_height)
                }
                uvs[String(point[0])] = uv;
            }
            mesh.addFaces(new MeshFace(mesh, { vertices, uvs }));
        }
        mesh.addTo(group).init();
    }
}

function getVertexNormal(mesh, vertexKey, vertexFacesMap) {
    if (settings["skip_normals"].value) return [ 0,1,0 ];
    let normalSum = [0, 0, 0];
    let faceCount = 0;

    const faces = vertexFacesMap.get(vertexKey) || []
    for (let face of faces) {
        face = mesh.faces[face];
        let faceNormal = face.getNormal();
        normalSum[0] += faceNormal[0];
        normalSum[1] += faceNormal[1];
        normalSum[2] += faceNormal[2];
        faceCount++;
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

function rotatePoint(point, center, rotation) {
    // Convert rotation angles to radians
    const [rx, ry, rz] = rotation.map(Math.degToRad);

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
