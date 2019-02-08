'use strict';

const { existsSync: exists, readFileSync: readFile, writeFileSync: writeFile, lstatSync: stat } = require('fs');

const { red, green, yellow, cyan, blue, magenta } = require('kleur');
const { resolve, join, relative, sep }            = require('path');
const glob                                        = require('tiny-glob');
const prompts                                     = require('prompts');

const levels = new Map([
    ['FINEST', 'TRACE'],
    ['FINER', 'DEBUG'],
    ['FINE', 'INFO'],
    ['INFO', 'INFO'],
    ['WARNING', 'WARN'],
    ['SEVERE', 'ERROR']
]);

let dir = process.argv[2];

function isDir(path) {
    return exists(path = resolve(path)) && stat(path).isDirectory();
}

(async () => {
    try {
        let retry;
        while (retry || !dir || !exists(dir)) {
            retry = false;
            dir   = (await prompts({
                name: 'dir',
                type: 'text',
                message: 'Spécifiez un répertoire ou fichier',
                initial: () => dir || process.cwd()
            }, { onCancel: () => process.exit(0) })).dir;
            dir   = resolve(dir);
            
            if (exists(dir)) {
                let { confirmed } = await prompts({
                    name: 'confirmed',
                    type: 'confirm',
                    message: () => `Exécuter le script sur «${cyan(isDir(dir)
                        ? join(dir, '/**/*.java') : dir)}» ?`,
                    initial: true
                }, { onCancel: () => retry = true });
                retry             = retry || !confirmed;
            } else {
                retry = true;
                console.log(red('Le chemin spécifié est inexistant!'));
            }
        }
        
        let files = isDir(dir)
            ? await glob(join(dir, '/**/*.java').replace(/\\/g, '/'),
                { filesOnly: true })
            : [dir];
        
        console.log(cyan('Execution...'));
        
        await Promise.all(files.map(f => transform(f, dir)));
        
        console.log(green('\nScript execution completed!'));
    } catch (err) {
        console.error(red().bold(err.message));
        console.error(err.stack);
        process.exit(0);
    }
})();

async function transform(file, baseDir) {
    try {
        const relFile = '...' + sep + relative(baseDir, file);
        
        console.log(cyan(`\n  Transforming «${blue().bold(relFile)}» ...`));
        
        const levelsPattern = Array.from(levels.keys())
            .reduce((arr, lvl) => arr.concat(lvl, lvl.toLowerCase()), [])
            .join('|');
        
        console.log(blue(`    Reading «${cyan(relFile)}» ...`));
        let content = readFile(file, 'utf8');
        
        console.log(blue(`    Replacing old library in «${cyan(relFile)}» ...`));
        content = content
            .replace(/import java\.util\.logging\.Level;\s*?\n/g, '')
            .replace(/import java\.util\.logging\.Logger;\s*?\n/g,
                'import org.apache.logging.log4j.LogManager;\nimport org.apache.logging.log4j.Logger;')
            .replace(/Logger\.getLogger\((\w+)[^;]+/g, 'LogManager.getLogger($1.class)')
            .replace(new RegExp(`(\\w+)\\.(?:log\\(Level\\.)?(${levelsPattern})(?:[,(])`, 'g'),
                (m, vName, lvl) => `${vName}.${levels.get(lvl.toUpperCase())
                    .toLowerCase()}(`);
        
        console.log(blue(`    Writing transformed content to «${cyan(relFile)}» ...`));
        writeFile(file, content, 'utf8');
        
        console.log(green(`  File «${cyan(relFile)}» transformed!`));
    } catch (e) {
        let err = new Error(`Script failed to transform «${yellow(relFile)}»`);
        err.stack += magenta('\n  Caused by: ') + red()
            .bold(e.message) + '\n    '
                     + e.stack.replace(/\n/g, '\n    ');
        throw err;
    }
}
