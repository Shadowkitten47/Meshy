const pluginInfo = {
    "name": "Meshy",
    "id": "meshy",
    "version": "1.0.3",
    "repository": "https://github.com/Shadowkitten47/Meshy"
};

const pluginSettings = [
    {
        id: "normalized_mesh_uvs",
        name: "Normalize Mesh UVs",
        description: "Normalize UVs of polymeshes",
        value: true,
        plugin: pluginInfo.id
    },
    {
        id: "meshy_meta_data",
        name: "Meshy Meta Data",
        description: "Adds meta data to bedrock polymeshes",
        value: true,
        plugin: pluginInfo.id
    },
    {
        id: "skip_mesh_normals",
        name: "Skip Mesh Normals",
        description: "Skips normal claculation on polymeshes",
        value: false,
        plugin: pluginInfo.id
    },
    {
        id: "force_textures",
        name: "Force Multi-Textures",
        description: "Forces bedrock formats to use Multi-Textures ( You will need to stitch the textures )",
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
    repository: pluginInfo.repository,
    onload() {
        let bedrock_old = Formats['bedrock_old']
        let bedrock = Formats['bedrock']
        bedrock.meshes = true;
        bedrock_old.meshes = true;
        for (let s of pluginSettings) {
            if (!settings[s.id]) {
                new setting(s.id, s);
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
                settings[s.id].remove();
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