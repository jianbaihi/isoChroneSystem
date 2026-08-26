# PoiProviderAdapter

`server/app/providers/poi/base.py` 定义可替换 Provider 边界。Adapter 负责请求转换、API 调用、分片/分页、字段解析、类别映射、Provider ID 与 attribution；不负责分钟分类、UI、泛地图或 display ring 算法。

现有 `OrsRemotePoiProvider` 满足该 Protocol，`PoiQueryService` 只依赖 `PoiProviderAdapter`。未来 Provider 只需新增 Adapter 与 category mapping，不需要修改分钟分类、详情 ViewModel 或传统地图。

