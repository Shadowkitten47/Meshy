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


