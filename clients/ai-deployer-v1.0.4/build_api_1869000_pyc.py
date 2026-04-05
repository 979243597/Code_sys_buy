from pathlib import Path
import py_compile


BASE_DIR = Path(__file__).resolve().parent
SOURCE = BASE_DIR / 'AI Deployer V1.0.4.api.1869000.xyz.py'
OUTPUT = BASE_DIR / 'build' / 'AI Deployer V1.0.4.api.1869000.xyz.cpython39.pyc'


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    py_compile.compile(
        str(SOURCE),
        cfile=str(OUTPUT),
        dfile='AI Deployer V1.0.py',
        doraise=True,
    )
    print(OUTPUT)


if __name__ == '__main__':
    main()
