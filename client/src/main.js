import Phaser from 'phaser';
import UsernameScene from './scenes/UsernameScene';
import CinematicScene from './scenes/CinematicScene';
import IntroScene from './scenes/IntroScene';
import TutorialScene from './scenes/TutorialScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';

const config = {
  type: Phaser.WEBGL,
  width: 560,
  height: 854,
  backgroundColor: '#0a0a0a',
  parent: 'game-container',
  antialias: true,
  roundPixels: false,
  pixelArt: false,
  powerPreference: 'high-performance',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: {
    target: 60,
    min: 20,
    smoothStep: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 800 },
      debug: false,
    },
  },
  scene: [UsernameScene, CinematicScene, IntroScene, TutorialScene, GameScene, UIScene],
};

new Phaser.Game(config);
