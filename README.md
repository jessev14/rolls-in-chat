![All Downloads](https://img.shields.io/github/downloads/jessev14/rolls-in-chat/total?style=for-the-badge)

![Latest Release Download Count](https://img.shields.io/github/downloads/jessev14/rolls-in-chat/latest/module.zip)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Frolls-in-chat&colorB=4aa94a)](https://forge-vtt.com/bazaar#package=rolls-in-chat)


[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/jessev14)

# Chat Card Rolls D&D5e

Chat Card Rolls is a FVTT module for the dnd5e system that implements embedding rolls into relevant chat cards.

![Chat Card Rolls D&D5e](/ric.png)

## Usage

The saving throw button on item chat cards will automatically cause those rolls to be added to the chat card itself, instead of creating a new chat card for the roll.

A keybinding is available (default `P`) to open a dialog prompt for other types of rolls (or stand-alone saving throws). A module setting can be enabled to turn the d20 icon in the chat log into a button that also opens the dialog prompt.

Each embedded roll can be hidden or deleted via context menu.

## Compatibility

- [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice/)
- Not tested with non-core rolling modules. No compatibility is expected.

## Dependencies

- [libWrapper](https://foundryvtt.com/packages/lib-wrapper)

- [socketlib](https://foundryvtt.com/packages/socketlib)
