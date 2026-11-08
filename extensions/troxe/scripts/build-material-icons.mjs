/**
 * Prunes vscode-material-icon-theme (MIT) into src/material/icons.generated.ts.
 *
 * The upstream repository is ~173 MB and ships 910 icons; a file browser needs a fraction of them, so
 * this reads the real definitions (bundled with rolldown, because upstream expands its pattern entries at
 * build time), keeps only the icons the lists below resolve to, and inlines their SVG markup.
 *
 * Usage: MATERIAL_REPO=/path/to/vscode-material-icon-theme node scripts/build-material-icons.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(here, '..');
const repo = process.env.MATERIAL_REPO ?? '/tmp/mit';
const outDir = join(extensionRoot, 'src', 'material');

if (!existsSync(join(repo, 'src/core/icons/fileIcons.ts'))) {
    console.error(`material icon theme source not found at ${repo} — clone it first:`);
    console.error(`  git clone --depth 1 --filter=blob:none --sparse https://github.com/material-extensions/vscode-material-icon-theme ${repo}`);
    console.error(`  git -C ${repo} sparse-checkout set icons src`);
    process.exit(1);
}

/** Extensions worth an icon in a game-server file manager. */
const extensions = [
    // java / server
    'jar', 'class', 'war', 'ear', 'gradle', 'groovy', 'kt', 'kts', 'java',
    // data and config
    'json', 'json5', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'properties', 'env', 'editorconfig',
    'xml', 'plist', 'hocon', 'tf', 'tfvars', 'hcl',
    // text and docs
    'txt', 'md', 'mdx', 'rst', 'adoc', 'log', 'csv', 'tsv', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'epub',
    // web
    'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'styl', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
    'php', 'py', 'rb', 'pl', 'lua', 'go', 'rs', 'swift', 'dart', 'c', 'h', 'cpp', 'hpp', 'cs', 'vb', 'sh', 'bash', 'zsh', 'fish',
    'bat', 'cmd', 'ps1', 'sql', 'prisma', 'graphql', 'proto', 'wasm',
    // images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tiff', 'psd', 'ai', 'eps', 'heic',
    // audio and video
    'mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'opus', 'mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v',
    // archives
    'zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'lz', 'zst', 'iso', 'pak', 'dat',
    // fonts
    'ttf', 'otf', 'woff', 'woff2', 'eot',
    // crypto and keys
    'pem', 'key', 'crt', 'cer', 'der', 'p12', 'pfx', 'pub', 'asc', 'gpg', 'jks',
    // misc
    'lock', 'sum', 'bak', 'tmp', 'swp', 'diff', 'patch', 'dmp', 'crash', 'pid', 'service', 'socket', 'timer',
];

/** Exact file names, matched before extensions. */
const fileNames = [
    'dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'makefile', 'cmakelists.txt', 'gemfile', 'rakefile',
    'justfile', 'vagrantfile', 'procfile', 'jakefile', 'gruntfile.js', 'gulpfile.js', 'webpack.config.js',
    'vite.config.ts', 'rollup.config.js', 'tsconfig.json', 'jsconfig.json', 'package.json', 'package-lock.json',
    'composer.json', 'composer.lock', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'cargo.toml', 'go.mod', 'go.sum',
    'requirements.txt', 'pipfile', 'pyproject.toml', 'setup.py', 'readme', 'changelog', 'license', 'contributing',
    'authors', 'notice', 'todo', 'credits', '.gitignore', '.gitattributes', '.gitmodules', '.dockerignore',
    '.env', '.env.example', '.env.local', '.htaccess', '.htpasswd', 'nginx.conf', 'apache2.conf', 'crontab',
    'authorized_keys', 'known_hosts', 'id_rsa', 'id_ed25519', '.bashrc', '.bash_profile', '.zshrc', '.profile',
    '.pteroignore', 'pteroignore', 'server.properties', 'bukkit.yml', 'spigot.yml', 'paper.yml', 'paper-global.yml',
    'purpur.yml', 'fabric-loader', 'start.sh', 'start.bat', 'stop.sh', 'eula.txt', 'ops.json', 'whitelist.json',
    'banned-players.json', 'banned-ips.json', 'usercache.json', 'permissions.yml', 'help.yml', 'bungeecord.yml',
    'velocity.toml', 'config.yml', 'latest.log', 'debug.log', 'server.log', 'query.log', 'crash.log',
];

/** Folder names worth a distinct glyph. */
const folderNames = [
    'src', 'source', 'sources', 'public', 'static', 'assets', 'asset', 'resources', 'resourcepacks', 'resource packs',
    'plugins', 'plugin', 'mods', 'mod', 'world', 'worlds', 'dimensions', 'datapacks', 'behaviour_packs',
    'logs', 'log', 'config', 'configs', 'configuration', 'crash-reports', 'crash-renders', 'dumps',
    'backup', 'backups', 'cache', 'temp', 'tmp', 'data', 'database', 'db', 'databases', 'migrations', 'seeds',
    'dist', 'build', 'out', 'target', 'bin', 'sbin', 'lib', 'libs', 'libraries', 'deps', 'dependencies',
    'node_modules', 'vendor', 'venv', 'virtualenv', 'scripts', 'hooks', 'tasks', 'jobs', 'ci', 'github', 'gitlab',
    'vscode', 'idea', 'eclipse', 'jest', 'coverage', 'reports', 'docs', 'documentation', 'examples', 'samples',
    'tests', 'test', '__tests__', 'spec', 'specs', 'e2e', 'api', 'app', 'apps', 'server', 'servers', 'client',
    'components', 'composables', 'containers', 'contexts', 'directives', 'helpers', 'utils', 'util', 'services',
    'models', 'schemas', 'routes', 'router', 'views', 'templates', 'layouts', 'pages', 'partials', 'widgets',
    'styles', 'css', 'js', 'ts', 'fonts', 'icons', 'images', 'img', 'media', 'audio', 'video', 'sounds', 'sound',
    'textures', 'models3d', 'schematics', 'schematics/worldedit', 'downloads', 'uploads', 'files', 'storage',
    'certs', 'cert', 'ssl', 'keys', 'secrets', 'env', 'environments', 'terraform', 'docker', 'k8s', 'kubernetes',
    'aws', 'azure', 'gcp', 'firebase', 'mail', 'emails', 'lang', 'locale', 'locales', 'localization', 'i18n', 'l10n',
    'themes', 'addons', 'behaviors', 'definitions', 'structures', 'features', 'functions', 'workers', 'queue',
    'proxy', 'velocity', 'waterfall', 'bungeecord', 'forge', 'fabric', 'neoforge', 'optifine', 'bedrock', 'pocketmine',
    'game', 'games', 'maps', 'levels', 'saves', 'screenshots', 'stats', 'advancements', 'scoreboard',
];

/**
 * Upstream has no Minecraft vocabulary, so a few server names borrow the closest existing glyph.
 * These only apply where upstream has no entry of its own.
 */
const extraExtensions = { war: 'java', ear: 'java' };

const extraFileNames = {
    '.pteroignore': 'git',
    pteroignore: 'git',
    authorized_keys: 'key',
    known_hosts: 'key',
    id_rsa: 'key',
    id_ed25519: 'key',
};

const extraFolderNames = {
    'crash-reports': 'folder-error',
    'crash-renders': 'folder-error',
    dumps: 'folder-error',
    world: 'folder-database',
    worlds: 'folder-database',
    dimensions: 'folder-database',
    datapacks: 'folder-database',
    saves: 'folder-database',
    levels: 'folder-database',
    maps: 'folder-database',
    keys: 'folder-keys',
    secrets: 'folder-keys',
    certs: 'folder-keys',
    cert: 'folder-keys',
    ssl: 'folder-keys',
};

/** The two default glyphs are templates upstream renames while building the extension. */
const svgFiles = { file: 'template', folder: 'folder-template' };

// ---------- read the real definitions ----------
const definitions = join(repo, 'pterodactyl-definitions.mjs');
const entry = join(repo, 'pterodactyl-entry.ts');
writeFileSync(entry, "export { fileIcons } from './src/core/icons/fileIcons';\nexport { folderIcons } from './src/core/icons/folderIcons';\n");
execFileSync(
    process.execPath,
    [
        '--input-type=module',
        '-e',
        `import { rolldown } from '${join(extensionRoot, 'node_modules/rolldown/dist/index.mjs')}';
         const bundle = await rolldown({ input: ${JSON.stringify(entry)}, platform: 'node', resolve: { extensions: ['.ts', '.js'] } });
         await bundle.write({ file: ${JSON.stringify(definitions)}, format: 'esm' });`,
    ],
    { stdio: 'inherit' },
);

const { fileIcons, folderIcons } = await import(definitions);

/** icon name → the SVG file that carries it, and the reverse lookups the panel needs. */
const byExtension = new Map();
const byFileName = new Map();
const byFolderName = new Map();

for (const icon of fileIcons.icons) {
    for (const name of icon.fileNames ?? []) byFileName.set(name.toLowerCase(), icon.name);
    for (const ext of icon.fileExtensions ?? []) byExtension.set(ext.toLowerCase(), icon.name);
}
for (const theme of folderIcons.filter((t) => t.name === 'specific')) {
    for (const icon of theme.icons) {
        for (const name of icon.folderNames ?? []) byFolderName.set(name.toLowerCase(), icon.name);
    }
}

const misses = { extensions: [], fileNames: [], folderNames: [], svg: [] };
const picked = new Map();

const take = (icon) => {
    if (icon && !picked.has(icon)) picked.set(icon, true);
};

const fileMap = {};
const folderMap = {};

for (const ext of extensions) {
    const icon = byExtension.get(ext) ?? extraExtensions[ext];
    if (icon) {
        fileMap[ext] = icon;
        take(icon);
    } else {
        misses.extensions.push(ext);
    }
}

for (const name of fileNames) {
    const icon =
        byFileName.get(name) ??
        extraFileNames[name] ??
        (name.includes('.') ? byExtension.get(name.slice(name.indexOf('.') + 1)) : undefined);
    if (icon) {
        fileMap[name] = icon;
        take(icon);
    } else {
        misses.fileNames.push(name);
    }
}

for (const name of folderNames) {
    const icon = byFolderName.get(name) ?? extraFolderNames[name];
    if (icon) {
        folderMap[name] = icon;
        take(icon);
    } else {
        misses.folderNames.push(name);
    }
}

const defaults = {
    file: fileIcons.defaultIcon.name,
    folder: folderIcons.find((t) => t.name === 'specific').defaultIcon.name,
};
take(defaults.file);
take(defaults.folder);

// ---------- inline the SVGs ----------
const svgs = {};
const rejected = [];
let bytes = 0;

/** The markup is inlined into the page, so anything that can run or reach out is a build failure. */
const unsafe = [
    [/<script/i, 'a script element'],
    [/<foreignObject/i, 'a foreignObject element'],
    [/\son[a-z]+\s*=/i, 'an event handler attribute'],
    [/href\s*=\s*"(?!#)/i, 'a non-local reference'],
    [/<!ENTITY/i, 'an entity declaration'],
];

for (const icon of picked.keys()) {
    const path = join(repo, 'icons', `${svgFiles[icon] ?? icon}.svg`);
    if (!existsSync(path)) {
        misses.svg.push(icon);
        continue;
    }

    const source = readFileSync(path, 'utf8');
    const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1] ?? '0 0 128 128';
    const body = source
        .replace(/<\?xml[^?]*\?>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!DOCTYPE[^>]*>/g, '')
        .replace(/<svg\b[^>]*>/, '')
        .replace(/<\/svg>/, '')
        .replace(/\s+xml:space="preserve"/g, '')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

    for (const [pattern, why] of unsafe) {
        if (pattern.test(body)) rejected.push(`${icon}: ${why}`);
    }

    svgs[icon] = { viewBox, body };
    bytes += body.length;
}

if (rejected.length) {
    console.error(`refusing to inline unsafe markup:\n  ${rejected.join('\n  ')}`);
    process.exit(1);
}

// ---------- write ----------
const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD']).toString().trim();
const banner = [
    // A legal comment (`/*!`) so the minifier keeps the attribution in the shipped chunk.
    '/*!',
    ` * Generated by scripts/build-material-icons.mjs — do not edit by hand.`,
    ' *',
    ' * Icons, names and the mapping below come from vscode-material-icon-theme,',
    ' * https://github.com/material-extensions/vscode-material-icon-theme — MIT, commit ' + sha + '.',
    ' * Copyright (c) 2022 Philipp Bohnen. Full licence text: src/material/LICENSE.mit.txt.',
    ' */',
].join('\n');

mkdirSync(outDir, { recursive: true });

const table = (name, value) => `export const ${name}: Record<string, string> = ${JSON.stringify(value, null, 4)};`;

writeFileSync(
    join(outDir, 'icons.generated.ts'),
    [
        banner,
        '',
        `/** Extension or exact file name → icon key. Exact names win, longest suffix next. */`,
        table('files', fileMap),
        '',
        '/** Folder name → icon key. */',
        table('folders', folderMap),
        '',
        '/** The two glyphs every other entry falls back to. */',
        `export const fallbacks = ${JSON.stringify(defaults)} as const;`,
        '',
        '/** Icon key → the SVG of that icon, split so the host element keeps control of its size. */',
        `export const glyphs: Record<string, { viewBox: string; body: string }> = ${JSON.stringify(svgs, null, 4)};`,
        '',
    ].join('\n'),
);

copyFileSync(join(repo, 'LICENSE'), join(outDir, 'LICENSE.mit.txt'));

const size = readFileSync(join(outDir, 'icons.generated.ts'), 'utf8').length;
console.log(`icons: ${Object.keys(svgs).length}  file keys: ${Object.keys(fileMap).length}  folder keys: ${Object.keys(folderMap).length}`);
console.log(`svg markup: ${(bytes / 1024).toFixed(1)} KB  generated file: ${(size / 1024).toFixed(1)} KB`);

for (const [group, list] of Object.entries(misses)) {
    if (list.length) console.log(`unmatched ${group}: ${list.join(', ')}`);
}
