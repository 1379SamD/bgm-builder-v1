import pngToIco from "png-to-ico";
import fs from "fs";

const buf = await pngToIco("assets/icon.png");
fs.writeFileSync("assets/icon.ico", buf);

console.log("icon.ico created");