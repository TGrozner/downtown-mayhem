# Quaternius Downtown City MegaKit subset

Source:
- Official pack page: https://quaternius.com/packs/downtowncitymegakit.html
- Official itch page: https://quaternius.itch.io/downtown-city-megakit
- License: CC0, https://creativecommons.org/publicdomain/zero/1.0/

The official itch download is protected by Cloudflare in automated sessions, so this
first integration uses the `building_large.glb` subset mirrored in the public
`pylonsync/pylon` example city kit. That example README identifies the kit target
as Quaternius Downtown City MegaKit and CC0:
https://github.com/pylonsync/pylon/blob/main/examples/sim/public/models/citykit/README.md

Keep this folder scoped to the small runtime subset used by Downtown Mayhem. Do not
drop the full 315-model pack here without measuring draw calls, textures, and warmup
costs.
