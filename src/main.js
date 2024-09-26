const pluginId = "meshy";

Plugin.register(pluginId, {
	title: 'Meshy',
	author: 'Shadowkitten47',
	icon: 'diamond',
	description: 'Loads meshy',
	version: '1.0.0',
	variant: 'both',
    onload() {
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


if (!settings["normalized_uvs"])
    new Setting("normalized_uvs", {
        name: "Normalize UVs",
        description: "Normalize uvs on export",
        value: true,
        plugin: pluginId
    })
if (!settings["meta_data"])
    new Setting("meta_data", {
        name: "Meta Data",
        description: "Adds meta data to mesh. ( For smaller file size disable this )",
        value: true,
        plugin: pluginId
    })
if (!settings["skip_normals"]) {
    new Setting("skip_normals", {
        name: "Skip Normals",
        description: "Model will lack all shading information",
        value: false,
        plugin: pluginId
    })
}
if (!settings["Force Multi-Textures"])
    new Setting("force_textures", {
        name: "Force Multi-Textures",
        description: "Forces all current Format to use multiple textures",
        value: !Project?.format?.single_texture ?? false,
        plugin: pluginId,
        onChange: (value) => {
            if (Project)
                Project.format.single_texture = !value
        }
    })
