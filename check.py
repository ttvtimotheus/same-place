import pandas as pd

df = pd.read_stata('scripts/data/raw/ZA8013_Wahldaten.dta')
kreise = df[df['agglvl'].str.startswith('KREISE')].copy()

# Nur ostdeutsche Regierungsbezirke
print(kreise[['krnr', 'name', 'regbez', 'wkr']].head(30).to_string())
print("\nEinzigartige regbez Werte:")
print(kreise['regbez'].unique())
