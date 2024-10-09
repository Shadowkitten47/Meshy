const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
//Do "node bundler" to run this script
//This bundler is just so it's easier to organize the JS files and so that a random id can be used for each version

function bundleJS(inputDir, outputFile) {
  const count = (process.env.COUNT || 0);
  // Read all JS files from the input directory
  const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.js'));


  let bundleContent = '';
  // Process each file

  const global = fs.readFileSync( path.join(inputDir, 'global.js'), 'utf-8');
  let main = fs.readFileSync(path.join(inputDir, 'main.js'), 'utf-8');
  pluginInfo = JSON.parse(main.match(/\{[\s\S]*?\}/)[0]);
  
  pluginInfo.version = pluginInfo.version + '-dev-' + uuid.v4();
  main = main.replace(/\{[\s\S]*?\}/, JSON.stringify(pluginInfo));

  bundleContent += `//This is a bundle of JS files\n`;
  bundleContent += `${global}`;
  bundleContent += `(function() {\n${main}\n})();\n\n`;
  bundleContent += `\n//#region Source Files\n`;
  

  files.forEach(file => {
    if ( file === 'global.js' || file === 'main.js' ) return;
    const filePath = path.join(inputDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Wrap the file content in a self-invoking function
    bundleContent += `\n\n// File: ${file}\n`;
    bundleContent += `(function() {\n${content}\n})();\n\n`;
  });
  bundleContent += `\n//#endregion\n`;


  // Write the bundle to the output file
  fs.writeFileSync(outputFile, bundleContent);

  console.log(`Bundle created successfully: ${outputFile}`);
  process.env.COUNT = count + 1;
}

// Usage
const inputDirectory = './src'; // Change this to your input directory
const outputFile = './meshy.js'; // Change this to your desired output file

bundleJS(inputDirectory, outputFile);