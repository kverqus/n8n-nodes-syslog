const fs = require('fs');
const path = require('path');

// Copy node and credential icons into dist
for (const dir of ['nodes', 'credentials']) {
	fs.cpSync(path.resolve(dir), path.resolve('dist', dir), {
		recursive: true,
		filter: (src) => fs.statSync(src).isDirectory() || /\.(png|svg)$/.test(src),
	});
}
