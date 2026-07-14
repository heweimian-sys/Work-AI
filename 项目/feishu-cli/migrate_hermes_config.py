"""将分散的 Hermes 配置安全迁移到 %LOCALAPPDATA%/hermes。"""

import argparse
import os
import shutil
from datetime import datetime
from pathlib import Path

import yaml


def read_env(path):
    values = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def write_env(path, values):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(f"{key}={value}" for key, value in values.items()) + "\n", encoding="utf-8")


def backup(path, backup_root):
    if not path.exists():
        return
    relative = Path(path.name)
    destination = backup_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)


def merge_env(canonical, legacy_paths):
    values = read_env(canonical)
    for legacy in legacy_paths:
        for key, value in read_env(legacy).items():
            values.setdefault(key, value)
    if values.get("FEISHU_OPEN_ID"):
        values.setdefault("FEISHU_OWNER_OPEN_ID", values["FEISHU_OPEN_ID"])
    values.setdefault("FEISHU_CLI_DIR", str(Path.home() / "hermes-agent" / "scripts"))
    write_env(canonical, values)


def update_yaml(path):
    data = yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else {}
    data = data or {}
    data.setdefault("agent", {})["skip_context_files"] = False
    memory = data.setdefault("memory", {})
    memory["memory_enabled"] = True
    memory["user_profile_enabled"] = False
    path.write_text(yaml.safe_dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")


def migrate(source_dir, canonical_home, legacy_homes=()):
    source_dir = Path(source_dir)
    canonical_home = Path(canonical_home)
    canonical_home.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_root = canonical_home / "backups" / f"feishu-cli-{stamp}"

    env_path = canonical_home / ".env"
    config_path = canonical_home / "config.yaml"
    managed = [
        (source_dir / "hermes" / "templates" / "SOUL.md", canonical_home / "SOUL.md"),
        (source_dir / "hermes" / "templates" / "USER.md", canonical_home / "memories" / "USER.md"),
        (source_dir / "hermes" / "templates" / "MEMORY.md", canonical_home / "memories" / "MEMORY.md"),
        (source_dir / "hermes" / "skills" / "feishu-cli" / "SKILL.md", canonical_home / "skills" / "feishu-cli" / "SKILL.md"),
    ]
    for path in [env_path, config_path, *(target for _, target in managed)]:
        backup(path, backup_root)

    legacy_envs = [Path(home) / ".env" for home in legacy_homes]
    legacy_envs.append(Path.home() / "hermes-agent" / ".env")
    merge_env(env_path, legacy_envs)
    update_yaml(config_path)
    for source, target in managed:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    return backup_root


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=Path(__file__).resolve().parent)
    parser.add_argument("--canonical-home", default=Path(os.environ.get("LOCALAPPDATA", Path.home())) / "hermes")
    parser.add_argument("--legacy-home", action="append", default=[Path.home() / ".hermes"])
    args = parser.parse_args()
    result = migrate(args.source, args.canonical_home, args.legacy_home)
    print(f"Hermes 配置迁移完成。备份目录：{result}")


if __name__ == "__main__":
    main()
