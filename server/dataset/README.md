# Bundled model assets

This folder contains trained model checkpoints and their class-label metadata:

- `species/best_fish_efficientnet_b0.pth`
- `disease/best_fish_disease_efficientnet_b0.pth`
- `labels.json`

These are model assets, not a database and not the raw training datasets. Keep the label order aligned with the checkpoint training classes. The ML loader lives in `server/ml/`.