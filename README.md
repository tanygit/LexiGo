# LexiGo

**Every guess adds a word to your world.**

LexiGo is a Wordle-style word game that also shows you the meaning of the word when the round ends.

## Features

- Guess a random 5-letter word in 6 tries
- Green, yellow and grey tiles to show how close each guess is
- Word meaning and part of speech shown after every game, win or lose
- Hint button that reveals one letter at a time (3 per game)
- Compact on-screen keyboard that tracks used letters, plus physical keyboard support
- Different popup styles for winning and losing
- Works on desktop and mobile

## Services used

The game runs fully in the browser and fetches data from free public APIs:

- **Datamuse API**: provides random common 5-letter words, checks guesses, and acts as a backup source for meanings
- **Free Dictionary API**: provides word meanings and checks that guesses are real words
- **Random Word API**: backup source for random words

An internet connection is needed to play.
