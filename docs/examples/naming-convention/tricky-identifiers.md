# Naming convention conversion examples

These fixtures illustrate how tricky identifiers normalize across the supported
case styles. Each example shows the original source alongside camel, Pascal,
snake lower, and snake upper conversions. Prefixes and structural delimiters are
retained so implementers can validate tokenizer behaviour.

| Original identifier  | camel               | pascal              | snake-lower           | snake-upper           |
| -------------------- | ------------------- | ------------------- | --------------------- | --------------------- |
| `hp2D_max`           | `hp2DMax`           | `Hp2DMax`           | `hp2d_max`            | `HP2D_MAX`            |
| `argument[0]`        | `argument[0]`       | `argument[0]`       | `argument[0]`         | `argument[0]`         |
| `argument[0].hp_max` | `argument[0].hpMax` | `argument[0].HpMax` | `argument[0].hp_max`  | `argument[0].HP_MAX`  |
| `global.__hpMax`     | `global.__hpMax`    | `global.__HpMax`    | `global.__hp_max`     | `global.__HP_MAX`     |
| `HTTPRequestURL`     | `httpRequestUrl`    | `HttpRequestUrl`    | `http_request_url`    | `HTTP_REQUEST_URL`    |
| `_privateValue`      | `_privateValue`     | `_PrivateValue`     | `_private_value`      | `_PRIVATE_VALUE`      |
| `__init__`           | `__init__`          | `__Init__`          | `__init__`            | `__INIT__`            |
| `pathFinder_state_2` | `pathFinderState2`  | `PathFinderState2`  | `path_finder_state_2` | `PATH_FINDER_STATE_2` |

> **Note:** Identifiers that already satisfy the requested case (e.g.,
> `argument[0]` for any style) remain unchanged.
