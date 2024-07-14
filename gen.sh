#!/bin/sh

if ! [ -x "$(command -v convert)" ]; then
  echo 'Error: ImageMagick is not installed' >&2
  echo 'Use brew install imagemagick on Mac OS X' >&2
  exit 1
fi

if [ $# -eq 0 ]; then
    echo 'Usage: generate-icons.sh <1024x1024 icon file name.png>' >&2
    exit 1
fi

filename="$1"
iconset_dir="${filename%.*}".iconset

mkdir -p icons
mkdir -p $iconset_dir

declare -a web_sizes=("16" "24" "32" "48" "64" "96" "128" "256" "512" "1024")
declare -a icns_sizes=("16" "32" "64" "128" "256" "512")

for i in "${web_sizes[@]}"
do
    echo "Processing $resized_path"
    resized_path="./icons/${i}x${i}.png"
    convert -background none -resize "!${i}x${i}" "$1" "$resized_path"

    # Mac OS X iconset
    for item in "${icns_sizes[@]}"; do
        if [[ $i == "$item" ]]; then
            cp $resized_path "./$iconset_dir/icon_${i}x${i}.png"

            if [[ "$prev_size" ]]
            then
                cp $resized_path "./$iconset_dir/icon_${prev_size}@2x.png"
            fi

            prev_size="${i}x${i}"
        fi
    done
done

# 1024x1024 icon
cp "./icons/1024x1024.png" "./$iconset_dir/icon_512x512@2x.png"

echo Generating uniform PNG...
cp icons/256x256.png ./icon.png

echo Generating Mac OS X iconset...
iconutil --convert icns "$iconset_dir" --output icon.icns

echo Generating Windows ICO...
convert "$1" -define icon:auto-resize icon.ico

echo Cleaning up...
rm -rf $iconset_dir

echo All done.
