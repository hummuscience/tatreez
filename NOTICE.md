# Notices and Attributions

## Pattern data

This project ships with a curated catalogue of Palestinian tatreez (cross-stitch)
patterns parsed from the **Tirazain Archive** at <https://tirazain.com/archive/>.

Each pattern in the planner's library retains its original source URL, region,
and Arabic name, surfaced in both the library card and the editor view. Click
"View original ↗" on any pattern to reach the canonical page on tirazain.com.

The patterns themselves are the cultural heritage of the communities that
created them — Ramallah, Hebron, Gaza, Jerusalem, Bethlehem, and many others
across historic Palestine. The Tirazain project digitised them; we surface
them here with attribution. If you use a pattern from this planner, please
keep the source link visible in any work you derive from it.

## Reference papers cited in the engine

The optimal stitch-path solver draws on:

- T. Biedl, J. Horton, A. López-Ortiz, *Cross-Stitching Using Little Thread*,
  CCCG 2005. <https://www.cccg.ca/proceedings/2005/54.pdf>
- E. Arkin et al., *The Embroidery Problem*. (Foundational formalism.)
- M. Tran, *Practical Methods for the Embroidery Problem*, 2022.

## Tools and libraries

- Vite, React, TypeScript — see `package.json` for the full dependency
  graph and their respective licenses.
- linkedom (XML parsing for OXS imports), pngjs (image rendering helpers).
- rclone (used at import time to fetch pattern files from Google Drive).
