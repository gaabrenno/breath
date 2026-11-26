import {assertEq} from './assert.js';
import {parseArgs, render, readVersion} from '../linux/cli.js';
import {EMPTY_VIEW} from '../linux/text.js';

const st = format => ({cmd: 'status', format});

export default {
    'sem argumentos': () => assertEq(parseArgs([]), st('text')),
    'status --waybar': () => assertEq(parseArgs(['status', '--waybar']), st('waybar')),
    '--waybar sozinho': () => assertEq(parseArgs(['--waybar']), st('waybar')),
    '--short': () => assertEq(parseArgs(['--short']), st('short')),
    '--json': () => assertEq(parseArgs(['--json']), st('json')),
    'refresh': () => assertEq(parseArgs(['refresh']), {cmd: 'refresh', format: 'text'}),
    'refresh --waybar': () => assertEq(parseArgs(['refresh', '--waybar']), {cmd: 'refresh', format: 'waybar'}),
    '--version': () => assertEq(parseArgs(['--version']).cmd, 'version'),
    'version': () => assertEq(parseArgs(['version']).cmd, 'version'),
    '-h': () => assertEq(parseArgs(['-h']).cmd, 'help'),
    '--help': () => assertEq(parseArgs(['--help']).cmd, 'help'),
    'opção desconhecida': () => assertEq(parseArgs(['--xyz']), {error: 'opção desconhecida: --xyz'}),
    'json com versão': () => assertEq(JSON.parse(render('json', EMPTY_VIEW, 0, '1.2.0')).version, '1.2.0'),
    'short vazio': () => assertEq(render('short', EMPTY_VIEW, 0, 'x'), '5h – · sem –'),
    'readVersion sem metadata': () => assertEq(readVersion('/nonexistent'), 'dev'),
};
