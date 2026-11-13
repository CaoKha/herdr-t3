import pathlib, sys, subprocess
root = pathlib.Path(sys.argv[1])
folders = ['.agents', '.cache', '.config', '.local', '.pi', '.ssh', 'Applications', 'Desktop', 'Documents', 'Downloads', 'Library', 'Movies', 'Music', 'Pictures', 'Projects', 'Public', 'Research', 'Sandbox', 'Source', 'Tools', 'Work', 'archive', 'notes', 'scripts']
for folder in folders:
    for branch in range(6):
        target = root / folder / f'project-{branch + 1:02}'
        target.mkdir(parents=True, exist_ok=True)
        for n in range(30):
            ext = ['ts', 'tsx', 'json', 'md', 'sh', 'txt'][n % 6]
            (target / f'file-{n + 1:02}.{ext}').write_text(f'// {folder}/project-{branch + 1:02}\nexport const value = {n};\n')
(root / 'README.md').write_text('# Files parity\n\nA read-only project tree.\n\n- Search files by path\n- Keep focus and selection separate\n')
(root / '.env').write_text('EXAMPLE=fixture-only\n')
(root / '.gitignore').write_text('.cache/\n')
chain = root / 'packages' / 'client' / 'src' / 'components' / 'deeply-nested'
chain.mkdir(parents=True, exist_ok=True)
(chain / 'an-intentionally-long-file-name-for-truncation-behaviour.test.ts').write_text('export const longName = true;\n')
subprocess.run(['git', 'init', '-q', str(root)], check=True)
print(f'fixture: {sum(1 for p in root.rglob("*") if ".git" not in p.parts)} entries')
