const DC = require("./XMLDiffCompare");
const fs = require('fs')

const Ori = process.argv[2];
const Curr = process.argv[3];
const TargetPath = process.argv[4];

//##Check files exist.
if(!fs.existsSync(Ori) || !fs.existsSync(Curr)) 
{
    if(!fs.existsSync(Ori)) console.log('[Error] File not found: ' + Ori);
    if(!fs.existsSync(Curr)) console.log('[Error] File not found:' + Curr);
    process.exit();
}

//##Get files.
var Xml = DC.OpenXMLProcess(Ori, Curr);

//##Compare files.
var Changing = DC.ChildrenCompare(Xml.OriginalQuery.children(), Xml.CurrentQuery.children(), Xml.OriginalQuery.get(0));
console.log("[Debug] Get " + Changing.length + " modify.");

if(Changing.length > 0)
{
//##Add changing comment from ChangingArray
var FullXML = DC.AddChangingComment(Changing, Xml.OriginalDOM, Xml.CurrentDOM);


var ClearXML = DC.ConfigClear(FullXML);
//##Export XML.
DC.CreateModifyAfterFile(ClearXML, TargetPath);
}

process.exit();