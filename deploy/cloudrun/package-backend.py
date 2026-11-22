#!/usr/bin/env python3
"""Package an already built Wanwan plugin for direct Cloud Run upload."""

import argparse
import hashlib
from io import BytesIO
import json
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


PLUGIN_JAR = re.compile(r"plugin-wanwan-(\d+\.\d+\.\d+)\.jar")
ROOT_COMPONENT = "run.wanwan.api.WebHomeRedirect"
ENTRY_JAR = "plugin-wanwan-web-entry-1.0.0.jar"
ENTRY_MANIFEST = """apiVersion: plugin.halo.run/v1alpha1
kind: Plugin
metadata:
  name: wanwan-web-entry
  labels:
    halo.run/do-not-overwrite: "true"
spec:
  enabled: true
  requires: ">=2.27.0"
  displayName: "小脚丫 Web 入口"
  description: "将云托管根路径跳转到小脚丫公开网站。"
  version: "1.0.0"
"""


def web_entry_jar(component):
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("META-INF/MANIFEST.MF", "Manifest-Version: 1.0\r\n\r\n")
        archive.writestr("plugin.yaml", ENTRY_MANIFEST)
        archive.writestr("META-INF/plugin-components.idx", ROOT_COMPONENT + "\n")
        archive.writestr(ROOT_COMPONENT.replace(".", "/") + ".class", component)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jar", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--compatible-jar", type=Path, action="append", default=[],
                        help="Bundle an older published JAR for an existing Halo registration")
    args = parser.parse_args()
    match = PLUGIN_JAR.fullmatch(args.jar.name)
    if not match:
        parser.error("Expected a versioned plugin-wanwan-x.y.z.jar")
    version = match[1]

    with ZipFile(args.jar) as jar:
        manifest = jar.read("plugin.yaml").decode("utf-8")
        component = jar.read(ROOT_COMPONENT.replace(".", "/") + ".class")
        if not any(name.startswith("console/") and name.endswith(".js") for name in jar.namelist()):
            parser.error("Build the Halo Console interface before packaging the JAR")
    plugin_name = '  name: "wanwan"\n'
    if plugin_name not in manifest or f'  version: "{version}"' not in manifest:
        parser.error("Plugin name or version does not match the upload package")
    if not re.search(r"(?m)^  enabled: true$", manifest):
        parser.error("The embedded manifest must enable the plugin for a fresh installation")
    jars = [args.jar]
    for candidate in args.compatible_jar:
        old_version = PLUGIN_JAR.fullmatch(candidate.name)
        if not old_version or any(candidate.name == jar.name for jar in jars):
            parser.error("Compatibility JARs must use distinct plugin-wanwan-x.y.z.jar filenames")
        with ZipFile(candidate) as jar:
            old_manifest = jar.read("plugin.yaml").decode("utf-8")
        if plugin_name not in old_manifest or f'  version: "{old_version[1]}"' not in old_manifest:
            parser.error(f"Compatibility JAR has an unexpected plugin name or version: {candidate.name}")
        jars.append(candidate)

    recovery = manifest.replace(
        plugin_name, plugin_name + '  labels:\n    halo.run/do-not-overwrite: "true"\n', 1,
    )
    recovery = recovery.rstrip() + "\n---\n" + ENTRY_MANIFEST
    files = json.dumps([*(jar.name for jar in jars), ENTRY_JAR, "/opt/wanwan/plugins/"])
    dockerfile = f'''FROM halohub/halo:2.27.3
COPY {files}
COPY wanwan-plugin-recovery.yaml /opt/wanwan/wanwan-plugin-recovery.yaml
COPY entrypoint.sh /opt/wanwan/entrypoint.sh
RUN chmod +x /opt/wanwan/entrypoint.sh
ENV HALO_INITIAL_EXTENSION_LOCATIONS="file:/opt/wanwan/wanwan-plugin-recovery.yaml" \\
    JVM_OPTS="-Xmx1024m -Xms512m" PORT="80" WANWAN_REQUIRE_MYSQL="1"
EXPOSE 80
ENTRYPOINT ["/opt/wanwan/entrypoint.sh"]
'''
    args.output_dir.mkdir(parents=True, exist_ok=True)
    output = args.output_dir / f"wanwan-cloudrun-mysql-{version}.zip"
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("Dockerfile", dockerfile)
        archive.writestr("wanwan-plugin-recovery.yaml", recovery)
        archive.write(Path(__file__).with_name("entrypoint.sh"), "entrypoint.sh")
        for jar in jars:
            archive.write(jar, jar.name)
        archive.writestr(ENTRY_JAR, web_entry_jar(component))
    print(f"{hashlib.sha256(output.read_bytes()).hexdigest()}  {output}")


if __name__ == "__main__":
    main()
