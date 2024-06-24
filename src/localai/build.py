import subprocess
import shutil
import os

def build_localai():
    try:
      if os.path.exists('dist'):
          shutil.rmtree('dist')
    except Exception as e:
        print(f"Error during copying files: {e}")
    try:
        # Run PyInstaller to build the project
        subprocess.run(['pyinstaller', 'localai.spec'], check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error during PyInstaller build: {e}")
        return

    # Define the source and destination paths
    src = os.path.join('dist', 'localai')
    dst = os.path.join('..', '..', 'release', 'app', 'localai')

    # Copy the built files to the destination directory
    try:
        if os.path.exists(dst):
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
        print(f"Successfully copied {src} to {dst}")
    except Exception as e:
        print(f"Error during copying files: {e}")

if __name__ == "__main__":
    build_localai()
