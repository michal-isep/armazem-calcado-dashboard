# Raw CSV files are not versioned in Git

The data files stay local: `data/` and `*.csv` are git-ignored and only `data/.gitkeep` is tracked. The files are large and are not ours to republish. The original files are never edited; the ETL reads them and loads PostgreSQL. Each team member needs a local copy, and the data profile records the measured facts so results can be checked against it.
