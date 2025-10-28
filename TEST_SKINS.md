# Test des Skins - Guide de Debug

## Comment tester:

1. **Ouvrir la console** (F12)
2. **Cliquer sur "Customize Skins"**
3. **Vérifier les logs:**

```
Initializing skin editors...
Editors created, setting up UI...
Loading premade skins...
Generated 8 character skins
Generated 8 bomb skins
Skin editor initialization complete!
```

## Si les skins préfaits ne s'affichent pas:

### Vérifier dans la console:
```javascript
// Vérifier que les grids existent
document.getElementById('characterPremadeGrid')
document.getElementById('bombPremadeGrid')

// Vérifier qu'ils ont des enfants
document.getElementById('characterPremadeGrid').children.length  // Devrait être 8

// Tester la génération manuellement
import('./js/skinEditor.js').then(module => {
    const skins = module.PremadeSkins.generateCharacterSkins();
    console.log(skins);
});
```

### Vérifier le CSS:
```javascript
// Vérifier que le CSS est chargé
getComputedStyle(document.querySelector('.premade-skin')).display
```

## Si ça ne marche toujours pas:

### Solution 1: Vérifier que les canvas se créent
Ouvrir les DevTools → Elements → Chercher `#characterPremadeGrid`
Tu devrais voir 8 divs `.premade-skin` avec des `<canvas>` à l'intérieur

### Solution 2: Force reload
Ctrl + Shift + R pour recharger sans cache

### Solution 3: Vérifier les erreurs
Console → Regarder s'il y a des erreurs en rouge

## Test manuel rapide:

```javascript
// Dans la console, après avoir ouvert le modal:
const grid = document.getElementById('characterPremadeGrid');
const test = document.createElement('div');
test.style.width = '64px';
test.style.height = '64px';
test.style.background = 'red';
grid.appendChild(test);
// Tu devrais voir un carré rouge
```

## Checklist:

- [ ] Modal s'ouvre bien
- [ ] Les deux canvas (preview + editor) s'affichent
- [ ] Les outils (crayon, gomme, etc.) sont cliquables
- [ ] Les couleurs preset sont visibles
- [ ] La grille des skins préfaits est visible (même vide)
- [ ] Les logs console s'affichent sans erreur
- [ ] Le dessin fonctionne sur le canvas principal

Si tout est OK sauf les skins préfaits → Problème dans `PremadeSkins.generateCharacterSkins()`
Si rien ne s'affiche → Problème CSS ou modal caché
