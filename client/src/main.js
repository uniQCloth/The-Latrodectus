import Phaser from 'phaser';
import UsernameScene from './scenes/UsernameScene';
import CinematicScene from './scenes/CinematicScene';
import IntroScene from './scenes/IntroScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';

const config = {
  type: Phaser.AUTO,
  width: 560,
  height: 854,
  backgroundColor: '#0a0a0a',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 800 },
      debug: false,
    },
  },
  scene: [UsernameScene, CinematicScene, IntroScene, GameScene, UIScene],
};

new Phaser.Game(config);
