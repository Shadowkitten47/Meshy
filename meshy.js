//This is a bundle of JS files
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
		return face.vertices.map( (vertexKey) => {
			let nIndex = -1;
			let uIndex = -1;
            
            const uv = uvsOnSave([face.uv[vertexKey][0], face.uv[vertexKey][1]])
            
			if (indexFindArr(poly_mesh.uvs, uv) === -1 ) {
				poly_mesh.uvs.push(uv);
				uIndex = poly_mesh.uvs.length - 1;
			}
			else uIndex = indexFindArr(poly_mesh.uvs, uv) 

            if (!vKeyToNormalIndex[vertexKey]) {
                poly_mesh.normals.push(getVertexNormal(mesh, vertexKey));
                vKeyToNormalIndex[vertexKey] = poly_mesh.normals.length - 1
            }
			nIndex = vKeyToNormalIndex[vertexKey];

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
//#endregion

//The following code is from blockbench source code with slight modifications
//Most code that is unqiue to this project is above
//And are shared function between bedrock_old and bedrock in witch no major changes are made

//#region Source Files


// File: bedrock-old.js
(function() {
var codec = Codecs["bedrock_old"]
 
//Mostly the same
function parseGeometry(data) {
	let geometry_name = data.name.replace(/^geometry\./, '');

	let existing_tab = isApp && ModelProject.all.find(project => (
		Project !== project && project.export_path == Project.export_path && project.geometry_name == geometry_name
	))
	if (existing_tab) {
		Project.close().then(() =>  {
			existing_tab.select();
		});
		return;
	}

	codec.dispatchEvent('parse', {model: data.object});
	Project.geometry_name = geometry_name;
	Project.texture_width = data.object.texturewidth || 64;
	Project.texture_height = data.object.textureheight || 64;

	if (typeof data.object.visible_bounds_width == 'number' && typeof data.object.visible_bounds_height == 'number') {
		Project.visible_box[0] = Math.max(Project.visible_box[0], data.object.visible_bounds_width || 0);
		Project.visible_box[1] = Math.max(Project.visible_box[1], data.object.visible_bounds_height || 0);
		if (data.object.visible_bounds_offset && typeof data.object.visible_bounds_offset[1] == 'number') {
			Project.visible_box[2] = data.object.visible_bounds_offset[1] || 0;
		}
	}

	var bones = {}

	if (data.object.bones) {
		var included_bones = []
		data.object.bones.forEach(function(b) {
			included_bones.push(b.name)
		})
		data.object.bones.forEach(function(b, bi) {
			var group = new Group({
				name: b.name,
				origin: b.pivot,
				rotation: b.rotation,
				material: b.material,
				color: Group.all.length%markerColors.length
			}).init()
			bones[b.name] = group
			if (b.pivot) {
				group.origin[0] *= -1
			}
			group.rotation[0] *= -1;
			group.rotation[1] *= -1;
			
			group.mirror_uv = b.mirror === true
			group.reset = b.reset === true

			if (b.cubes) {
				b.cubes.forEach(function(s) {
					var base_cube = new Cube({name: b.name, autouv: 0, color: group.color})
					if (s.origin) {
						base_cube.from.V3_set(s.origin);
						base_cube.from[0] = -(base_cube.from[0] + s.size[0])
						if (s.size) {
							base_cube.to[0] = s.size[0] + base_cube.from[0]
							base_cube.to[1] = s.size[1] + base_cube.from[1]
							base_cube.to[2] = s.size[2] + base_cube.from[2]
						}
					}
					if (s.uv) {
						base_cube.uv_offset[0] = s.uv[0]
						base_cube.uv_offset[1] = s.uv[1]
					}
					if (s.inflate && typeof s.inflate === 'number') {
						base_cube.inflate = s.inflate
					}
					if (s.mirror === undefined) {
						base_cube.mirror_uv = group.mirror_uv
					} else {
						base_cube.mirror_uv = s.mirror === true
					}
					base_cube.addTo(group).init()
				})
			}
			//Changed Code
			if (b.poly_mesh) {
				polymesh_to_mesh(b, group)
			}
			//End if change
			if (b.children) {
				b.children.forEach(function(cg) {
					cg.addTo(group)
				})
			}
			if (b.locators) {
				for (var key in b.locators) {
					var coords, rotation;
					if (b.locators[key] instanceof Array) {
						coords = b.locators[key];
					} else {
						coords = b.locators[key].offset;
						rotation = b.locators[key].rotation;
					}
					coords[0] *= -1
					var locator = new Locator({position: coords, name: key, rotation}).addTo(group).init();
				}
			}
			var parent_group = 'root';
			if (b.parent) {
				if (bones[b.parent]) {
					parent_group = bones[b.parent]
				} else {
					data.object.bones.forEach(function(ib) {
						if (ib.name === b.parent) {
							ib.children && ib.children.length ? ib.children.push(group) : ib.children = [group]
						}
					})
				}
			}
			group.addTo(parent_group)
		})
	}

	codec.dispatchEvent('parsed', {model: data.object});

	loadTextureDraggable()
	Canvas.updateAllBones()
	setProjectTitle()
	if (isApp && Project.geometry_name && Project.BedrockEntityManager) {
		Project.BedrockEntityManager.initEntity()
	}
	Validator.validate()
	updateSelection()
}



//Same as source just need to change parseGeometry 
codec.parse = function (data, path) {
	let geometries = [];
	for (let key in data) {
		if (typeof data[key] !== 'object') continue;
		geometries.push({
			name: key,
			object: data[key]
		});
	}
	if (geometries.length === 1) {
		parseGeometry(geometries[0]);
		return;
	} else if (isApp && BedrockEntityManager.CurrentContext?.geometry) {
		return parseGeometry(geometries.find(geo => geo.name == BedrockEntityManager.CurrentContext.geometry));
	}

	geometries.forEach(geo => {
		geo.uuid = guid();

		geo.bonecount = 0;
		geo.cubecount = 0;
		if (geo.object.bones instanceof Array) {
			geo.object.bones.forEach(bone => {
				geo.bonecount++;
				if (bone.cubes instanceof Array) geo.cubecount += bone.cubes.length;
			})
		}
	})

	let selected = null;
	new Dialog({
		id: 'bedrock_model_select',
		title: 'dialog.select_model.title',
		buttons: ['Import', 'dialog.cancel'],
		component: {
			data() {return {
				search_term: '',
				geometries,
				selected: null,
			}},
			computed: {
				filtered_geometries() {
					if (!this.search_term) return this.geometries;
					let term = this.search_term.toLowerCase();
					return this.geometries.filter(geo => {
						return geo.name.toLowerCase().includes(term)
					})
				}
			},
			methods: {
				selectGeometry(geo) {
					this.selected = selected = geo;
				},
				open(geo) {
					Dialog.open.hide();
					parseGeometry(geo);
				},
				tl
			},
			template: `
				<div>
					<search-bar v-model="search_term"></search-bar>
					<ul class="list" id="model_select_list">
						<li v-for="geometry in filtered_geometries" :key="geometry.uuid" :class="{selected: geometry == selected}" @click="selectGeometry(geometry)" @dblclick="open(geometry)">
							<p>{{ geometry.name }}</p>
							<label>{{ geometry.bonecount+' ${tl('dialog.select_model.bones')}' }}, {{ geometry.cubecount+' ${tl('dialog.select_model.cubes')}' }}</label>
						</li>
					</ul>
				</div>
			`
		},
		onConfirm() {
			parseGeometry(selected);
		}
	}).show();
}

codec.compile = function compile(options) {
	if (options === undefined) options = {}
	var entitymodel = {}
	entitymodel.texturewidth = Project.texture_width;
	entitymodel.textureheight = Project.texture_height;
	var bones = []
	var visible_box = new THREE.Box3()

	var groups = getAllGroups();
	var loose_elements = [];
	Outliner.root.forEach(obj => {
		if (obj.type === 'cube' || obj.type == 'locator') {
			loose_elements.push(obj)
		}
	})
	if (loose_elements.length) {
		let group = new Group({
			name: 'bb_main'
		});
		group.children.push(...loose_elements);
		group.is_catch_bone = true;
		group.createUniqueName();
		groups.splice(0, 0, group);
	}

	groups.forEach(function(g) {
		if (g.type !== 'group' || g.export == false) return;
		if (!settings.export_empty_groups.value && !g.children.find(child => child.export)) return;
		//Bone
		var bone = {}
		bone.name = g.name
		if (g.parent.type === 'group') {
			bone.parent = g.parent.name
		}
		bone.pivot = g.origin.slice()
		bone.pivot[0] *= -1
		if (!g.rotation.allEqual(0)) {
			bone.rotation = [
				-g.rotation[0],
				-g.rotation[1],
				g.rotation[2]
			]
		}
		if (g.reset) bone.reset = true;
		if (g.mirror_uv && Project.box_uv) bone.mirror = true;
		if (g.material) bone.material = g.material;

		//Elements
		var cubes = []
		var locators = {};
		var poly_mesh = null;

		for (var obj of g.children) {
			if (obj.export) {
				if (obj instanceof Cube) {
					var template = new oneLiner()
					template.origin = obj.from.slice()
					template.size = obj.size()
					template.origin[0] = -(template.origin[0] + template.size[0])
					template.uv = obj.uv_offset
					if (obj.inflate && typeof obj.inflate === 'number') {
						template.inflate = obj.inflate
					}
					if (obj.mirror_uv === !bone.mirror) {
						template.mirror = obj.mirror_uv
					}
					//Visible Bounds
					var mesh = obj.mesh
					if (mesh) {
						visible_box.expandByObject(mesh)
					}
					cubes.push(template)

				} else if (obj instanceof Locator) {

					locators[obj.name] = obj.position.slice();
					locators[obj.name][0] *= -1;
				} else if (obj instanceof Mesh ) {
					poly_mesh = mesh_to_polymesh(poly_mesh, obj);
				}
			}
		}
		if (cubes.length) {
			bone.cubes = cubes
		}
		if (Object.keys(locators).length) {
			bone.locators = locators
		}
		if (poly_mesh !== null) {
			bone.poly_mesh = poly_mesh
		}
		bones.push(bone)
	})

	if (bones.length && options.visible_box !== false) {

		let visible_box = calculateVisibleBox();
		entitymodel.visible_bounds_width = visible_box[0] || 0;
		entitymodel.visible_bounds_height = visible_box[1] || 0;
		entitymodel.visible_bounds_offset = [0, visible_box[2] || 0, 0]
	}
	if (bones.length) {
		entitymodel.bones = bones
	}
	this.dispatchEvent('compile', {model: entitymodel, options});

	if (options.raw) {
		return entitymodel
	} else {
		var model_name = 'geometry.' + (Project.geometry_name||Project.name||'unknown')
		return autoStringify({
			format_version: '1.10.0',
			[model_name]: entitymodel
		})
	}
}








})();



// File: bedrock.js
(function() {
var codec = Codecs["bedrock"]
 
//ON LOAD

codec.parse = function parse(data, path) {
    if (Format != Formats.bedrock && Format != Formats.bedrock_block) Formats.bedrock.select()

    let geometries = [];
    for (let geo of data['minecraft:geometry']) {
        if (typeof geo !== 'object') continue;
        geometries.push({
            object: geo,
            name: geo.description?.identifier || ''
        });
    }
    if (geometries.length === 1) {
        return parseGeometry(geometries[0]);
    } else if (isApp && BedrockEntityManager.CurrentContext?.geometry) {
        return parseGeometry(geometries.find(geo => geo.name == BedrockEntityManager.CurrentContext.geometry));
    }

    geometries.forEach(geo => {
        geo.uuid = guid();

        geo.bonecount = 0;
        geo.cubecount = 0;
        if (geo.object.bones instanceof Array) {
            geo.object.bones.forEach(bone => {
                geo.bonecount++;
                if (bone.cubes instanceof Array) geo.cubecount += bone.cubes.length;
            })
        }
    })

    let selected = null;
    new Dialog({
        id: 'bedrock_model_select',
        title: 'dialog.select_model.title',
        buttons: ['Import', 'dialog.cancel'],
        component: {
            data() {return {
                search_term: '',
                geometries,
                selected: null,
            }},
            computed: {
                filtered_geometries() {
                    if (!this.search_term) return this.geometries;
                    let term = this.search_term.toLowerCase();
                    return this.geometries.filter(geo => {
                        return geo.name.toLowerCase().includes(term)
                    })
                }
            },
            methods: {
                selectGeometry(geo) {
                    this.selected = selected = geo;
                },
                open(geo) {
                    Dialog.open.hide();
                    parseGeometry(geo);
                },
                tl
            },
            template: `
                <div>
                    <search-bar v-model="search_term"></search-bar>
                    <ul class="list" id="model_select_list">
                        <li v-for="geometry in filtered_geometries" :key="geometry.uuid" :class="{selected: geometry == selected}" @click="selectGeometry(geometry)" @dblclick="open(geometry)">
                            <p>{{ geometry.name }}</p>
                            <label>{{ geometry.bonecount+' ${tl('dialog.select_model.bones')}' }}, {{ geometry.cubecount+' ${tl('dialog.select_model.cubes')}' }}</label>
                        </li>
                    </ul>
                </div>
            `
        },
        onConfirm() {
            parseGeometry(selected);
        }
    }).show();
}

function parseGeometry(data) {

    let {description} = data.object;
    let geometry_name = (description.identifier && description.identifier.replace(/^geometry\./, '')) || '';

    let existing_tab = isApp && ModelProject.all.find(project => (
        Project !== project && project.export_path == Project.export_path && project.geometry_name == geometry_name
    ))
    if (existing_tab) {
        Project.close().then(() =>  {
            existing_tab.select();
        });
        return;
    }

    codec.dispatchEvent('parse', {model: data.object});

    Project.geometry_name = geometry_name;
    Project.texture_width = 16;
    Project.texture_height = 16;

    if (typeof description.visible_bounds_width == 'number' && typeof description.visible_bounds_height == 'number') {
        Project.visible_box[0] = Math.max(Project.visible_box[0], description.visible_bounds_width || 0);
        Project.visible_box[1] = Math.max(Project.visible_box[1], description.visible_bounds_height || 0);
        if (description.visible_bounds_offset && typeof description.visible_bounds_offset[1] == 'number') {
            Project.visible_box[2] = description.visible_bounds_offset[1] || 0;
        }
    }

    if (description.texture_width !== undefined) {
        Project.texture_width = description.texture_width;
    }
    if (description.texture_height !== undefined) {
        Project.texture_height = description.texture_height;
    }

    var bones = {}

    if (data.object.bones) {
        var included_bones = []
        data.object.bones.forEach(function(b) {
            included_bones.push(b.name)
        })
        data.object.bones.forEach(function(b) {
            parseBone(b, bones, data.object.bones)
        })
    }

    Project.box_uv = Cube.all.filter(cube => cube.box_uv).length > Cube.all.length/2;

    codec.dispatchEvent('parsed', {model: data.object});

    loadTextureDraggable()
    Canvas.updateAllBones()
    setProjectTitle()
    if (isApp && Project.geometry_name) {
        if (Format.id == 'bedrock') Project.BedrockEntityManager.initEntity();
        if (Format.id == 'bedrock_block') Project.BedrockBlockManager.initBlock();
    }
    Validator.validate()
    updateSelection()
}
function parseBone(b, bones, parent_list) {
    var group = new Group({
        name: b.name,
        origin: b.pivot,
        rotation: b.rotation,
        material: b.material,
        bedrock_binding: b.binding,
        color: Group.all.length%markerColors.length
    }).init()
    group.createUniqueName();
    bones[b.name] = group
    if (b.pivot) {
        group.origin[0] *= -1
    }
    group.rotation.forEach(function(br, axis) {
        if (axis !== 2) group.rotation[axis] *= -1
    })
    
    group.mirror_uv = b.mirror === true
    group.reset = b.reset === true

    if (b.cubes) {
        b.cubes.forEach(function(s) {
            parseCube(s, group)
        })
    }
    if (b.locators) {
        for (let key in b.locators) {
            let coords, rotation, ignore_inherited_scale;
            if (b.locators[key] instanceof Array) {
                coords = b.locators[key];
            } else {
                coords = b.locators[key].offset;
                rotation = b.locators[key].rotation;
                ignore_inherited_scale = b.locators[key].ignore_inherited_scale;
            }
            coords[0] *= -1;
            if (rotation instanceof Array) {
                rotation[0] *= -1;
                rotation[1] *= -1;
            }
            if (key.substr(0, 6) == '_null_' && b.locators[key] instanceof Array) {
                new NullObject({from: coords, name: key.substr(6)}).addTo(group).init();
            } else {
                new Locator({position: coords, name: key, rotation, ignore_inherited_scale}).addTo(group).init();
            }
        }
    }
    if (b.texture_meshes instanceof Array) {
        b.texture_meshes.forEach(tm => {
            let texture = Texture.all.find(tex => tex.name == tm.texture);
            let texture_mesh = new TextureMesh({
                texture_name: tm.texture,
                texture: texture ? texture.uuid : null,
                origin: tm.position,
                rotation: tm.rotation,
                local_pivot: tm.local_pivot,
                scale: tm.scale,
            })
            texture_mesh.local_pivot[2] *= -1;
            texture_mesh.origin[1] *= -1;

            if (b.pivot) texture_mesh.origin[1] += b.pivot[1];

            texture_mesh.origin[0] *= -1;
            texture_mesh.rotation[0] *= -1;
            texture_mesh.rotation[1] *= -1;
            texture_mesh.addTo(group).init();
        })
    }
    if (b.children) {
        b.children.forEach(function(cg) {
            cg.addTo(group);
        })
    }

    //Change
    if (b.poly_mesh) {
        polymesh_to_mesh(b, group)
    }
    //End Change
    var parent_group = 'root';
    if (b.parent) {
        if (bones[b.parent]) {
            parent_group = bones[b.parent]
        } else {
            parent_list.forEach(function(ib) {
                if (ib.name === b.parent) {
                    ib.children && ib.children.length ? ib.children.push(group) : ib.children = [group]
                }
            })
        }
    }
    group.addTo(parent_group)
}



//ON SAvE

codec.compile = function compile(options) {
    if (options === undefined) options = {}

    var entitymodel = {}
    var main_tag = {
        format_version: getFormatVersion(),
        'minecraft:geometry': [entitymodel]
    }
    entitymodel.description = {
        identifier: 'geometry.' + (Project.geometry_name||'unknown'),
        texture_width:  Project.texture_width || 16,
        texture_height: Project.texture_height || 16,
    }
    var bones = []

    var groups = getAllGroups();
    var loose_elements = [];
    Outliner.root.forEach(obj => {
        if (obj instanceof OutlinerElement) {
            loose_elements.push(obj)
        }
    })
    if (loose_elements.length) {
        let group = new Group({
            name: 'bb_main'
        });
        group.children.push(...loose_elements);
        group.is_catch_bone = true;
        group.createUniqueName();
        groups.splice(0, 0, group);
    }
    groups.forEach(function(g) {
        let bone = compileGroup(g);
        bones.push(bone)
    })

    if (bones.length && options.visible_box !== false) {

        let visible_box = calculateVisibleBox();
        entitymodel.description.visible_bounds_width = visible_box[0] || 0;
        entitymodel.description.visible_bounds_height = visible_box[1] || 0;
        entitymodel.description.visible_bounds_offset = [0, visible_box[2] || 0 , 0]
    }
    if (bones.length) {
        entitymodel.bones = bones
    }
    this.dispatchEvent('compile', {model: main_tag, options});

    if (options.raw) {
        return main_tag
    } else {
        return autoStringify(main_tag)
    }
}

function getFormatVersion() {
	for (let cube of Cube.all) {
		for (let fkey in cube.faces) {
			if (cube.faces[fkey].rotation) return '1.21.0';
		}
	}
	if (Group.all.find(group => group.bedrock_binding)) return '1.16.0';
	return '1.12.0';
}

function compileGroup(g) {
    if (g.type !== 'group' || g.export == false) return;
    if (!settings.export_empty_groups.value && !g.children.find(child => child.export)) return;
    //Bone
    var bone = {}
    bone.name = g.name
    if (g.parent.type === 'group') {
        bone.parent = g.parent.name
    }
    bone.pivot = g.origin.slice()
    bone.pivot[0] *= -1
    if (!g.rotation.allEqual(0)) {
        bone.rotation = g.rotation.slice()
        bone.rotation[0] *= -1;
        bone.rotation[1] *= -1;
    }
    if (g.bedrock_binding) {
        bone.binding = g.bedrock_binding
    }
    if (g.reset) {
        bone.reset = true
    }
    if (g.mirror_uv && Project.box_uv) {
        bone.mirror = true
    }
    if (g.material) {
        bone.material = g.material
    }
    // Elements
    var cubes = []
    var locators = {};
    var texture_meshes = [];
    var poly_mesh = null;

    for (var obj of g.children) {
        if (obj.export) {
            if (obj instanceof Cube) {
                let template = compileCube(obj, bone);
                cubes.push(template);
            } else if (obj instanceof Mesh ) {
                poly_mesh = mesh_to_polymesh(poly_mesh, obj);
            } else if (obj instanceof Locator || obj instanceof NullObject) {
                let key = obj.name;
                if (obj instanceof NullObject) key = '_null_' + key;
                let offset = obj.position.slice();
                offset[0] *= -1;

                if ((obj.rotatable && !obj.rotation.allEqual(0)) || obj.ignore_inherited_scale) {
                    locators[key] = {
                        offset
                    };
                    if (obj.rotatable) {
                        locators[key].rotation = [
                            -obj.rotation[0],
                            -obj.rotation[1],
                            obj.rotation[2]
                        ]
                    }
                    if (obj.ignore_inherited_scale) {
                        locators[key].ignore_inherited_scale = true;
                    }
                } else {
                    locators[key] = offset;
                }
            } else if (obj instanceof TextureMesh) {
                let texmesh = {
                    texture: obj.texture_name,
                    position: obj.origin.slice(),
                }
                texmesh.position[0] *= -1;
                texmesh.position[1] -= bone.pivot[1];
                texmesh.position[1] *= -1;

                if (!obj.rotation.allEqual(0)) {
                    texmesh.rotation = [
                        -obj.rotation[0],
                        -obj.rotation[1],
                        obj.rotation[2]
                    ]
                }
                if (!obj.local_pivot.allEqual(0)) {
                    texmesh.local_pivot = obj.local_pivot.slice();
                    texmesh.local_pivot[2] *= -1;
                }
                if (!obj.scale.allEqual(1)) {
                    texmesh.scale = obj.scale.slice();
                }
                texture_meshes.push(texmesh);
            } 
        }
    }

    if (cubes.length) {
        bone.cubes = cubes
    }
    if (texture_meshes.length) {
        bone.texture_meshes = texture_meshes
    }
    if (Object.keys(locators).length) {
        bone.locators = locators
    }
    if (poly_mesh !== null) {
        bone.poly_mesh = poly_mesh
    }
    return bone;
}



})();


//#endregion
