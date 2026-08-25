# Overture Places 数据目录

本目录只保存可复现的 manifest、分类显示名和空目录占位。真实 GeoParquet/GeoJSON 原始文件放在 `data/raw/overture/2026-07-22.0/<region>/`，生成的 SQLite、WAL/SHM 和质量报告临时文件放在 `data/generated/`；两者均已加入 Git 忽略。

固定 release：`2026-07-22.0`。应用运行时只读取本地 SQLite，不访问 Overture 云端 POI 文件。

当前项目资料没有明确国外实验城市，也没有明确武汉实际研究 bbox。因此 `manifests/*example.json` 只是结构示例，不能标记 ready、不能用于真实验收。确定城市和研究范围后，复制示例为实际 manifest，填写真实 sourceFile 与导入前 SHA-256，并使用同一个 importer、release、confidence 规则和清洗规则。

数据来源、schema 和分类语义以 Overture Places 官方文档为准；原始文件许可/署名随 release manifest 保存。不得提交原始 POI、数据库、Token 或密钥。
