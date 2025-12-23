TheeCoin Wallet for Termux (Android)
====================================

Usage Instructions:

1. Ensure you have Termux and a file manager app like NMM installed
2. Also ensure that you have added Termux to your file manager

How To Add Termux To NMM App:
Go into NMM menu, press + button, choose External Storage, press menu, choose Termux, then Use This Folder
(Ensure you have run the command termux-setup-storage in termux so that your phone will be able to do this)

3. Create a new folder named TheeCoin in the root of your new Termux directory (using your file manager) 
4. Extract all of the files and folders from TheeCoin.zip file into that new TheeCoin folder you created

You should now have all the files and folders within a new folder named TheeCoin in Termux's home folder

How To Run TheeCoin Wallet:
Simply navigate to the TheeCoin folder within Termux (use cd TheeCoin) then run one of these commands...

node run.js or bash run.sh

Congrats! You can now use TheeCoin Wallet on Termux Terminal

If you would prefer a graphical interface, use the web interface
To navigate to the web interface, just go to http://localhost:3000
The chat Interface will only work on web interface on Android wallet


YOU MUST HAVE NODE.JS INSTALLED TO RUN THEECOIN WALLET!

How to Install Node.js in Termux

1. Update and upgrade your Termux package lists and installed packages
Run this command: pkg update && pkg upgrade

2. Install Node.js using the pkg install command
Run this command: pkg install nodejs
