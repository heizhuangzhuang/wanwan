#!/usr/bin/env python3
"""Package an already built Wanwan plugin for direct Cloud Run upload."""

import argparse
import hashlib
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("jar", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    match = re.fullmatch(r"plugin-wanwan-(\d+\.\d+\.\d+)\.jar", args.jar.name)
    if not match:
        parser.error("Expected a versioned plugin-wanwan-x.y.z.jar")
    version = match[1]

    with ZipFile(args.jar) as jar:
        manifest = jar.read("plugin.yaml").decode("utf-8")
        if not any(name.startswith("console/") and name.endswith(".js") for name in jar.namelist()):
            parser.error("Build the Halo Console interface before packaging the JAR")
    plugin_name = '  name: "wanwan"\n'
    if plugin_name not in manifest or f'  version: "{version}"' not in manifest:
        parser.error("Plugin name or version does not match the upload package")
    if not re.search(r"(?m)^  enabled: true$", manifest):
        parser.error("The embedded manifest must enable the plugin for a fresh installation")
    recovery = manifest.replace(
        plugin_name, plugin_name + '  labels:\n    halo.run/do-not-overwrite: "true"\n', 1,
    )
    dockerfile = f'''FROM halohub/halo:2.27.3
COPY {args.jar.name} /opt/wanwan/plugins/
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
        archive.write(args.jar, args.jar.name)
    print(f"{hashlib.sha256(output.read_bytes()).hexdigest()}  {output}")


if __name__ == "__main__":
    main()
