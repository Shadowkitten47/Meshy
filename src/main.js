const pluginInfo = {
    "name": "Meshy",
    "id": "meshy",
    "version": "1.0.3",
    "repository": "https://github.com/Shadowkitten47/Meshy"
};

const pluginSettings = [
    {
        id: "meshy_normalized_mesh_uvs",
        name: "Normalize Mesh UVs",
        description: "Normalize UVs of polymeshes",
        category: 'export',
        value: true,
        plugin: pluginInfo.id
    },
    {
        id: "meshy_meta_data",
        name: "Meshy Meta Data",
        description: "Adds meta data to bedrock polymeshes",
        category: 'export',
        value: true,
        plugin: pluginInfo.id
    },
    {
        id: "meshy_skip_mesh_normals",
        name: "Skip Mesh Normals",
        description: "Skips normal claculation on polymeshes",
        category: 'export',
        value: false,
        plugin: pluginInfo.id
    },
    {
        //Force disable single texture on bedrock formats having more than one texture with meshes is pretty useful
        id: "meshy_force_textures",
        name: "Force Multi-Textures",
        description: "Forces bedrock formats to use allow more than one texture ( You will need to stitch the textures )",
        category: 'edit',
        value: false,
        plugin: pluginInfo.id,
        onChange: (value) => {
            Formats['bedrock'].single_texture = !value
            Formats['bedrock_old'].single_texture = !value
        }
    }
]

Plugin.register(pluginInfo.id, {
	title: pluginInfo.name,
	author: 'Shadowkitten47',
	icon: 'diamond',
	description: 'Enables the use of a meshes in bedrock formats and to export them to Minecraft Bedrock',
	version: pluginInfo.version,
	variant: 'both',
    creation_date: "2024-09-28",
    min_version: "4.10.4",
    tags: [
			"Minecraft: Bedrock Edition",
			"Entity Models",
			"Mesh"
	],
    repository: pluginInfo.repository,
    onload() {
        let bedrock_old = Formats['bedrock_old']
        let bedrock = Formats['bedrock']
        bedrock.meshes = true;
        bedrock_old.meshes = true;
        for (let s of pluginSettings) {
            if (!settings[s.id]) {
                new Setting(s.id, s);
            }
        }

        bedrock.single_texture = !settings["single_texture"]?.value
        bedrock_old.single_texture = !settings["single_texture"]?.value
    },
    onunload() {
        let bedrock_old = Formats['bedrock_old']
        let bedrock = Formats['bedrock']
        bedrock.meshes = false;
        bedrock_old.meshes = false;
        bedrock.single_texture = true;
        bedrock_old.single_texture = true;
        for (let s of pluginSettings) {
            if (settings[s.id]) {
                settings[s.id].delete(); 
            }
        }

    }
});

//Unfinshed
// function BedrockOldCompile(model, options) {
//     const groups = getAllGroups();
//     for (const group of groups) {
//         console.warn(group)
//     }
//     model.bones = []
// }