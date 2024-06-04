// get-version.js
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.resolve(__dirname, 'release', 'app', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;
const outputFilePath = process.env.GITHUB_ENV;
fs.appendFileSync(outputFilePath, `VERSION=${version}\n`);
