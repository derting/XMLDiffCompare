const fs = require('fs')
const path = require('path')
var DOMParser = require('xmldom').DOMParser;
const XmlReader = require('xml-reader');
const reader = XmlReader.create();
const xmlQuery = require('xml-query');
const pd = require('pretty-data').pd;

var _HeaderParams = [];
exports.OpenXMLProcess = OpenXMLProcess;
exports.ChildrenCompare = ChildrenCompare;
exports.AddChangingComment = AddChangingComment;
exports.CreateModifyAfterFile = CreateModifyAfterFile;
exports.ConfigClear = ConfigClear;
// ## XMLDom Compare
// (1)Get xml files to compare and to get different.
//    -- 取得 Original 改前 
//    -- 取得 Current  現在
// (2)Use begin/end to Write different statement.
//    -- 產出 ModifyAfter  改後, 只保留bing/end字段其餘剃除。
function OpenXMLProcess(Ori, Curr)
{
  var A_xml = fs.readFileSync(Ori, 'utf8').toString();
  A_xml = NormalizationStart(A_xml);
  const A_ast = XmlReader.parseSync(A_xml);
  const OriginalQuery = xmlQuery(A_ast);
  OriginalDOM = new DOMParser().parseFromString(A_xml,'text/xml');

  var B_xml = fs.readFileSync(Curr, 'utf8').toString();
  B_xml = NormalizationStart(B_xml);
  const B_ast = XmlReader.parseSync(B_xml);
  const CurrentQuery = xmlQuery(B_ast);
  CurrentDOM = new DOMParser().parseFromString(B_xml,'text/xml');

  return {OriginalDOM, OriginalQuery, CurrentDOM, CurrentQuery};
}

//比對Current與Original變動
function ChildrenCompare(OriNodes, CurrNodes, parentNode)
{
  var Modify = [];
  var Ori = OriNodes.map(y=>y);
  var Curr = CurrNodes.map(y=>y);

  //原本跟現有的比對：
  for(var i=0; i<Ori.length; i++)
  {
    var Node = Ori[i];
    if(Curr.length == 0)
    {
      //原有的被移除
      Modify.push({Type:"Delete", Node:Node, Parent:parentNode  })
    }
    else
    {
      for(var j=0; j<Curr.length; j++)
      {

        //找到另一檔案中同Name同屬性的元素, 判斷兩Node是否一致
        if(Node.type == 'element')
        {
          if(Curr[j].name == Node.name && JSON.stringify(Node.attributes) == JSON.stringify(Curr[j].attributes))
          {
            //檢查子項目是否被 Add-----------------------------------------------
            //var childrenAddition = ChildrenAddition(Node.children, Curr[j].children, Node)
            //if(childrenAddition.length > 0)
            //  childrenAddition.map(y=>Modify.push(y));

            //檢查Update-----------------------------------------------
            if(Node.children.length > 0)
            {
              var childrenModify = ChildrenCompare(Node.children, Curr[j].children, Node)
              if(childrenModify.length > 0)
                childrenModify.map(y=>Modify.push(y));
            }
            else if(Node.value != Curr[j].value)
            {
              //原有的被修改
              Modify.push({Type:"Update", Node:Curr[j], Parent:Node  })
            }
            break;
          }
        }
        else if(Node.type == 'text' && Curr[j].type == 'text')
        {
          //Text會進來應該來自同Parent name & attributes
          if(Node.value != Curr[j].value)
          {
            Modify.push({Type:"Update", Node:Curr[j].parent , Parent:Curr[j].parent.parent  })
          }
          break;
        }

        //檢查刪除-----------------------------------------------
        if(Curr.length-1 == j)
        {
            //原有的被移除
            Modify.push({Type:"Delete", Node:Node, Parent:parentNode  })
        }
      }
    }
  }

  //現有的跟原有的比對:
  for(var i=0; i<Curr.length; i++)
  {
    var Node = Curr[i];
    if(Ori.length == 0)
    {
      //原有沒有Dom, 現有卻有，表示現有有新增Dom
      Modify.push({Type:"Add", Node:Node, Parent:parentNode  })
    }
    else
    {
      //遍歷原有的Dom
      for(var j=0; j<Ori.length; j++)
      {
        //找到另一檔案中同Name同屬性的元素, 判斷兩Node是否一致

        if(Node.type == 'element')
        {
          if(Ori[j].name == Node.name && JSON.stringify(Node.attributes) == JSON.stringify(Ori[j].attributes))
          {
            //當原有Dom沒有Child時，現有Obj卻有Child，表示有的全都是新增的。
            if(Node.children.length > 0 && Ori[j].children.length == 0)
            {
              for(var c in Node.children)
                Modify.push({Type:"Add", Node:Node.children[c], Parent:parentNode  });
            }

            break;//沒有變動
          }
        }
        else if(Node.type == 'text')
        {
            break;
        }

        if(Ori.length-1 == j)
        {
            //原有的被新增
            Modify.push({Type:"Add", Node:Node, Parent:parentNode  })
        }
      }
    }
  }

  return Modify;
}

//比對Current與Original變動 - 是否有新增Node
function ChildrenAddition(OriChilds, CurrChilds, parentNode)
{
  var Modify = [];

  //
  //Curr子項目是否有新增是Ori子項目沒有的
  for(var ch_j = 0; ch_j < CurrChilds.length; ch_j++)
  {
    if(OriChilds.length == 0)
    {
      //Ori沒有Curr有，表示是新增
      Modify.push({Type:"Add", Node:CurrChilds[ch_j], Parent:parentNode  });
    }
    else
    {
      for(var ch_i = 0; ch_i < OriChilds.length; ch_i++)
      {
        if(CurrChilds[ch_j].name == OriChilds[ch_i].name && JSON.stringify(CurrChilds[ch_j].attributes) == JSON.stringify(OriChilds[ch_i].attributes))
        {
          break;
        }
        else if(ch_i == OriChilds.length - 1)
        {
          //現有的新增  
          Modify.push({Type:"Add", Node:OriChilds[ch_i], Parent:parentNode  });
        }
      }
    }
  }
  return Modify;
}

//增加Begin/End字段
function AddChangingComment(modifyMarkup, OriginalDOM, CurrentDOM)
{
    var ModifyConfig = '';
    //當有修改時，才會進入ModifyAfter檔案的產生add comment程序
    if(modifyMarkup.length > 0)
    {
        for(var i = 0; i < modifyMarkup.length; i++)
        {
            if(modifyMarkup[i].Type == 'Delete')
            {
                var result =  AddCommentForSpecifyNode_Delete(OriginalDOM, CurrentDOM, modifyMarkup[i].Node);
                while(result.parentNode != null)
                {
                  result = result.parentNode
                }
                CurrentDOM = result;
            }
            else if(modifyMarkup[i].Type == 'Update' || modifyMarkup[i].Type == 'Add')
            {
                var result = AddCommentForSpecifyNode_Update_Add(CurrentDOM, modifyMarkup[i].Node, modifyMarkup[i].Type);
                while(result.parentNode != null)
                {
                  result = result.parentNode
                }
                CurrentDOM = result;
            }
        }
        return CurrentDOM.toString();
    }
}

//加上Beging/End字段 - 動作為Delete時
function AddCommentForSpecifyNode_Delete(OriginalDom, CurrentDom, SpecifyNode)
{
  var newDOM = new DOMParser().parseFromString(OriginalDom.toString(),'text/xml');
  var Target = '';
  if(SpecifyNode.type == 'text')
  {
      Target = { nodeName: SpecifyNode.parent.name, attributes: SpecifyNode.parent.attributes }

      var str = "<!-- Begin, Delete these nodes. -->" + SpecifyNode.value + "<!-- End, Delete these nodes. -->";
      newDOM = new DOMParser().parseFromString(str,'text/xml');
  }
  else
  {
      Target = { nodeName: SpecifyNode.name, attributes: SpecifyNode.attributes, parent: SpecifyNode.parent };
      var item = FindNodeFromDOMParser(newDOM, Target.nodeName, Target.attributes, Target ,Target.parent);
      var str = "<!-- Begin, Delete these nodes. -->" + item.toString() + "<!-- End, Delete these nodes. -->";
      newDOM = new DOMParser().parseFromString(str,'text/xml');
  }

  CurrentDom = new DOMParser().parseFromString(CurrentDom.toString(),'text/xml');
  var item = FindNodeFromDOMParser(CurrentDom, SpecifyNode.parent.name, SpecifyNode.parent.attributes, SpecifyNode.parent, SpecifyNode.parent.parent);
  item.appendChild(newDOM);

  return item.parentNode;
}

//加上Beging/End字段 - 動作為Update/Add時
function AddCommentForSpecifyNode_Update_Add(CurrentDom, SpecifyNode, Type)
{
  var tmpDom = new DOMParser().parseFromString(CurrentDom.toString(),'text/xml');

  var Target = '';
  if(SpecifyNode.type == 'text' || (SpecifyNode.type == 'element' && Type == 'Add'))
  {
      Target = { nodeName: SpecifyNode.parent.name, attributes:SpecifyNode.parent.attributes, Node:SpecifyNode.parent,  parent: SpecifyNode.parent.parent }
  }
  else
  {
      Target = { nodeName: SpecifyNode.name, attributes:SpecifyNode.attributes, Node:SpecifyNode,  parent:SpecifyNode.parent }
  }
  
  var item = FindNodeFromDOMParser(tmpDom, Target.nodeName, Target.attributes, Target.Node, Target.parent)

  if(Type == 'Add' && SpecifyNode.type == 'element')
  {
    var t = FindNodeFromDOMParserWithoutParent(item, SpecifyNode.name, SpecifyNode.attributes)
    tmpDom.insertBefore(tmpDom.createComment(' Begin, ' + Type + ' these nodes. '), t);
    tmpDom.insertBefore(tmpDom.createComment(' End, ' + Type + ' these nodes. '), t.nextSibling);
  }
  else
  {
    tmpDom.insertBefore(tmpDom.createComment(' Begin, ' + Type + ' these nodes. '), item);
    tmpDom.insertBefore(tmpDom.createComment(' End, ' + Type + ' these nodes. '), item.nextSibling);
  }

  return tmpDom;
}

//Descript:　指定Dom中找對應的Node點
//FullDOM: 整個XML DomParse物件
//nodeName: 目標Dom名稱
//nodeAttributes: 目標Dom參數
//Node: 目標Dom DomParse物件
//parentNode: 目標Dom ParentNode DomParse物件
function FindNodeFromDOMParser(FullDOM, nodeName, nodeAttributes, Node, parentNode)
{
  if(nodeAttributes == undefined)
    nodeAttributes = {};

  var array = FullDOM.getElementsByTagName(nodeName);                       //Target NodeName
  if(Node == null || parentNode == null)
  {
    return FindNodeFromDOMParserWithoutParent(FullDOM, nodeName, nodeAttributes);
  }

  for(var i = 0; i< array.length; i++)
  {
    //attribute:
    var CurrAttrStr = {};
    if(array.item(i).attributes.length != 0)
      CurrAttrStr = DomsAttributeToJson(array.item(i).attributes);

    //parent:
    var thisPatentName = array.item(i).parentNode.nodeName;
    var thisPatentAttr = GetParametersFromAttribute_DomParser(array.item(i).parentNode.attributes);
    var targetParentName = parentNode.name;
    var targetParentAttr = parentNode.attributes;

    if( 
        JSON.stringify(CurrAttrStr) == JSON.stringify(nodeAttributes) &&    //Target Attr
        thisPatentName == targetParentName &&                               //Parent NodeName
        JSON.stringify(thisPatentAttr) == JSON.stringify(targetParentAttr)  //Parent Attr
      )
    {
      var result = array.item(i);
      return result;
    }
  }
  return null;
}

//Descript:　指定Dom中找對應的Node點
function FindNodeFromDOMParserWithoutParent(FullDOM, nodeName, nodeAttributes)
{
  if(nodeAttributes == undefined)
    nodeAttributes = {};

  var array = FullDOM.getElementsByTagName(nodeName);                       //Target NodeName

  for(var i = 0; i< array.length; i++)
  {
    //attribute:
    var CurrAttrStr = {};
    if(array.item(i).attributes.length != 0)
      CurrAttrStr = DomsAttributeToJson(array.item(i).attributes);

    if( JSON.stringify(CurrAttrStr) == JSON.stringify(nodeAttributes))    //Target Attr
    {
      return array.item(i);
    }
  }
  return null;
}

//Get jsxml DOM's attribute Obj => {}, 以便JsonString化後比對
function GetParametersFromAttribute_jsxml(attrObj)
{
  var parameter = {};
  for(var x =0; x < attrObj.length; x++)
  {
    var key = attrObj[x]._qname.localName;
    var value = attrObj[x]._text;
    parameter[key]=value;
  }

  return parameter;
}

//Get DomParser DOM's attribute Obj => {}, 以便JsonString化後比對
function GetParametersFromAttribute_DomParser(attrObj)
{
  if(attrObj.length == 0)
    return {};
  
  var parameter = {};
  for(var x =0; x < attrObj.length; x++)
  {
    var key = attrObj[x].nodeName;
    var value = attrObj[x].nodeValue;
    parameter[key]=value;
  }

  return parameter;
}

//將Dom的Attributes(array)轉乘Json字串，以便與其他的Dom比對。
function DomsAttributeToJson(attrArry)
{
  var s = {};
  for(var i = 0; i <attrArry.length; i++)
  { 
    if(attrArry[i].nodeName == 'xmlns')
      continue;
    
    s[attrArry[i].nodeName] = attrArry[i].value;
  }
  return s;
}

const jsxml = require("node-jsxml");
//刪除無Begin/End字段元素
function ConfigClear(FullXml)
{
  var tmp = new jsxml.XML(FullXml);
  var tmpDom = new DOMParser().parseFromString(FullXml,'text/xml');
  var rangeFromBeginToEnd = false;
  var DelCommentIdx = [];
  var DelNodeIdx = [];

  for(var i = 0; i< tmp._children.length; i++){
    
    var childHasComment = false;
    if(tmp._children[i]._children.length > 0)
    {
      //call function
      var parameter =  GetParametersFromAttribute_jsxml(tmp._children[i]._attributes)

      var thisNode = tmp._children[i];
      var item = FindNodeFromDOMParser(tmpDom, thisNode._qname.localName, parameter, null, null);
      var tmpDomStr = item.toString();
      if(tmpDomStr.indexOf('Begin') != -1){
        childHasComment = true;
        var result = ConfigClear(tmpDomStr); 
        result = new DOMParser().parseFromString(result,'text/xml');
        tmpDom.removeChild(item);     
        item.parentNode.appendChild(result);
      }
    }
    
    if(childHasComment == false)
    {
      if(tmp._children[i]._nodeKind == 'comment' && tmp._children[i]._text.indexOf('Begin') != -1 && rangeFromBeginToEnd == false)
      {
        rangeFromBeginToEnd = true;
      }else if(tmp._children[i]._nodeKind == 'comment' && tmp._children[i]._text.indexOf('End') != -1 && rangeFromBeginToEnd == true ){
        rangeFromBeginToEnd = false;
      }else if(rangeFromBeginToEnd == false && tmp._children[i]._nodeKind == 'comment'){
        DelCommentIdx.push(tmp._children[i]._text);
      }else if(rangeFromBeginToEnd == false && tmp._children[i]._nodeKind == 'text' && tmp._children[i]._qname == null ){
        tmp._children[i]._text = '';
      }else if(rangeFromBeginToEnd == false && tmp._children[i]._nodeKind != 'comment' ){
        var parameter = GetParametersFromAttribute_jsxml(tmp._children[i]._attributes);
        DelNodeIdx.push({nodeName: tmp._children[i]._qname.localName, nodeParams: parameter});
      }
    }
  }

  if(DelCommentIdx.length > 0)
  {
    for(var i = 0; i < DelCommentIdx.length; i++)
    {
      tmpDom = tmpDom.toString().split('<!--' + DelCommentIdx[i] + '-->').join('');
    }
  }

  var newDom = new DOMParser().parseFromString(tmpDom.toString(),'text/xml');
  for(var i = 0; i < DelNodeIdx.length; i++)
  {
    if(DelNodeIdx[i].parent == null){
      var item = FindNodeFromDOMParser(newDom, DelNodeIdx[i].nodeName, DelNodeIdx[i].nodeParams, null, null);
      newDom.removeChild(item)
    }else{
      var item = FindNodeFromDOMParser(newDom, DelNodeIdx[i].nodeName, DelNodeIdx[i].nodeParams, DelNodeIdx[i], DelNodeIdx[i].parent);
      newDom.removeChild(item)
    }
  }
  
  return newDom.toString();
}

//XML局部修正，
//(1)若有關鍵字時，直接吐Error
//(2)TopNode 若有額外XMLNS設定要拿掉(於End時添加)
//(3)Node名稱相同者，要設暫時參數來保持唯一性(於End時要移除暫時參數:_tmp="Num")
//(4)去除益混淆判斷的註解(跨行的註解會導致誤判)
function NormalizationStart(xmlStr)
{
  //(1)若有關鍵字時，直接吐Error
  var WrongStr = [];
  if(xmlStr.indexOf('-->-->') != -1){
    WrongStr.push('-->-->');
  }
  if(xmlStr.indexOf('<!--<!--') != -1){
    WrongStr.push('<!--<!--');
  }

  if(WrongStr.length > 0)
  {
    var error = new Error('Has wronging Code Snippets:' + WrongStr.join(','));
    throw error;
  }

  DOM = new DOMParser().parseFromString(xmlStr,'text/xml');    

  //(2)TopNode 若有額外XMLNS設定要拿掉(於End時添加)
  _HeaderParams = [];
  for(var i in DOM.childNodes)
  {
    if(DOM.childNodes.item(i).nodeType == 1)
    {
      for(var idx=0; idx < DOM.childNodes.item(i).attributes.length; idx++)
      {
        var obj = DOM.childNodes.item(i).attributes.item(idx);
        _HeaderParams.push({NodeName:  DOM.childNodes.item(i).nodeName, key: obj.nodeName, value:obj.nodeValue});
      }
    }
  }
  for(var idx in _HeaderParams)
  {
    xmlStr = xmlStr.split(_HeaderParams.map(y=>y.key + '="' + y.value + '"')[idx]).join('');
  }

  DOM = new DOMParser().parseFromString(xmlStr,'text/xml');    
  //(3)Node名稱相同者，要設暫時參數來保持唯一性(於End時要移除暫時參數)
  for(var i in DOM.childNodes)
  {
    if(DOM.childNodes.item(i).nodeType == 1)
    {
      DOM = setChildParameter(DOM.childNodes.item(i));
    }
  }

  //(4)去除益混淆判斷的註解(跨行的註解會導致誤判)
  DOM = removeCommentChild(DOM)
  DOM = GetTopParentDOM(DOM);
  return DOM.toString();
}

//取得最外層的Dom
function GetTopParentDOM(DOM)
{
  var TOPDOM = DOM;
  while(TOPDOM.parentNode != null)
  {
    TOPDOM = TOPDOM.parentNode
  }
  return TOPDOM;
}

//移除DOM的註解
function removeCommentChild(DOM)
{
  //移除註解
  for(var i = 0; i < DOM.childNodes.length; i++)
  {
    if(DOM.childNodes.item(i).nodeType == 8)
    {
        DOM.removeChild(DOM.childNodes[i]);
    }
  }

  //針對Dom's Child再逐一處理
  for(var i = 0; i < DOM.childNodes.length; i++)
  {
    if(DOM.childNodes.item(i).nodeType == 1)
    {
      removeCommentChild(DOM.childNodes.item(i))
    }
  }
  return DOM;
}

//添加DOM的暫時參數
function setChildParameter(DOM)
{
  var TOPDOM = GetTopParentDOM(DOM)

  if(TOPDOM.getElementsByTagName(DOM.nodeName).length > 1)
  {
    //Get Full Parents String
    var parentDom = DOM;
    var parentName = [];
    while(parentDom.parentNode != null)
    {
      parentDom = parentDom.parentNode
      parentName.push(parentDom.nodeName);
    }
    parentName = parentName.join(',');

    var chidName = '';
    var childValue = '';

    //自己是最後一層
    //中間層 nodeTyp == 3 (need first element child)
    for(var i = 0; i < DOM.childNodes.length; i++)
    {
      if(DOM.childNodes[i].nodeType == 3 && DOM.childNodes[i].nodeValue.trim().length > 0)
      {
        //Text
        childValue = DOM.childNodes[i].nodeValue;
        chidName = "TT"
        break;
      }
      else if(DOM.childNodes[i].nodeType == 1)
      {
        //Element
        //且只有一個Text的Child
        if(DOM.childNodes[i].childNodes.length == 1 && DOM.childNodes[i].childNodes[0].nodeType == 3)
        {
          childValue = DOM.childNodes[1].childNodes[0].nodeValue;
          chidName = "ET";
        }
        break;
      }
    }

    var child = (chidName.length > 0 || childValue.length > 0) ? (">" + chidName + ":" + childValue) : '';
    _source = parentName + child;

    DOM.setAttribute('_sourcece', _source);
  }

  //針對Dom's Child再逐一處理
  for(var i = 0; i < DOM.childNodes.length; i++)
  {
    if(DOM.childNodes.item(i).nodeType == 1)
    {
      setChildParameter(DOM.childNodes.item(i))
    }
  }
  return DOM;
}


function NormalizationEnd(xmlStr)
{
  DOM = new DOMParser().parseFromString(xmlStr,'text/xml');

  for(var i in _HeaderParams)
  {
    DOM.getElementsByTagName(_HeaderParams[i].NodeName).item(0).setAttribute(_HeaderParams[i].key,_HeaderParams[i].value);
  }
  return DOM.toString();
}

//產出ModifyAfter檔案
function CreateModifyAfterFile(DOMStr, targetPath)
{
  DOMStr = NormalizationEnd(DOMStr);
  var xml_pp = pd.xml(DOMStr);

  var dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir);
    } catch (error) {
      //mkdir in loop
      var dirArray = dir.split('/');
      dirArray.forEach(function(value, index){
        var tmp = [];
        for(i=0; i<=index; i++)
        {
          tmp.push(dirArray[i])
        }
        if (!fs.existsSync(tmp.join('/'))) {
          fs.mkdirSync(tmp.join('/'));
        }
      });
    }
  }
  
  fs.writeFileSync(targetPath, xml_pp.toString(), 'utf-8');

  if(fs.existsSync(targetPath)){
    console.log('[Success] File saved to : '+ targetPath);
  }else{
    console.log('[Error] Connot Write file to path: '+ targetPath)
  }
}