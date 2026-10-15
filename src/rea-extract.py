#!/usr/bin/env python3
"""Extract one trusted archive without allowing archive paths or links to escape."""
import os
import pathlib
import sys
import tarfile
import zipfile


def safe_path(root, name):
    if not name or "\x00" in name:
        raise ValueError("invalid archive member")
    path = (root / name).resolve()
    if os.path.commonpath((root, path)) != str(root):
        raise ValueError("archive member escapes destination: " + name)
    return path


def safe_link(root, member, target):
    if not target or "\x00" in target:
        raise ValueError("invalid archive link")
    return safe_path(root, str(pathlib.PurePosixPath(member).parent / target))


def extract_tar(archive, root):
    with tarfile.open(archive, "r:*") as tar:
        for info in tar.getmembers():
            safe_path(root, info.name)
            if info.issym() or info.islnk():
                safe_link(root, info.name, info.linkname)
            if not (info.isdir() or info.isfile() or info.issym() or info.islnk()):
                raise ValueError("unsupported archive member: " + info.name)
        tar.extractall(root, filter="data")


def extract_zip(archive, root):
    with zipfile.ZipFile(archive) as zip_file:
        for info in zip_file.infolist():
            safe_path(root, info.filename)
            mode = info.external_attr >> 16
            if mode and (mode & 0o170000) == 0o120000:
                raise ValueError("zip symlinks are not supported: " + info.filename)
        zip_file.extractall(root)
        for info in zip_file.infolist():
            mode = info.external_attr >> 16
            if mode:
                os.chmod(safe_path(root, info.filename), mode & 0o777)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: rea-extract.py ARCHIVE DESTINATION")
    archive, destination = map(pathlib.Path, sys.argv[1:])
    root = destination.resolve()
    root.mkdir(parents=True, exist_ok=True)
    if tarfile.is_tarfile(archive):
        extract_tar(archive, root)
    elif zipfile.is_zipfile(archive):
        extract_zip(archive, root)
    else:
        raise ValueError("unsupported archive format")


if __name__ == "__main__":
    main()
