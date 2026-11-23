# Variation-Transformer

This folder contains inference scripts for the Variation Transformer model. For more details on the Variation Transformer, see [this repo](https://github.com/ChenyuGAO-CS/Variation-Transformer).

## Dependencies
```
pip install -r requirements.txt
```

## Reproducing Results
To generate variations using models trained by us, please visit [this page](https://github.com/ChenyuGAO-CS/Variation-Transformer-Data-and-Model) to download corresponding models and datasets, and store them in corresponding folders (e.g., we store models in ```'./trained_models/'``` folder, and datasets in ```'./dataset/'``` folder). 

We will show examples of how to use a model trained on the POP909-TVar dataset to generate a variation below. 

Please change ```--lm``` and ```--input``` if you would like to try models trained on the VGMIDI-TVar dataset or other themes as input. 

### Generate a variation by using the Variation Transformer
Run the script ```gen_VaTr_var_user_input.py``` from the ```workspace``` folder. 

```
$ python3 workspace/gen_VaTr_var_user_input.py --lm trained_models/VaTr_pop909_epoch_10.pth \ 
                           --seq_len 1025 \ 
                           --n_bars 16 \
                           --p 0.9 \
                           --save_to out/VaTr_variation1.mid \
                           --input dataset/POP909-TVar/test/052_B_0.mid
```

<!-- python3 workspace/gen_VaTr_var_user_input.py --lm /home/vargen/trained_models/VaTr_pop909_epoch_10.pth --seq_len 1025 --n_bars 16 --p 0.9 --save_to out/VaTr_variation1.mid --input /home/vargen/datasets/POP909-TVar/test/052_B_0.mid -->