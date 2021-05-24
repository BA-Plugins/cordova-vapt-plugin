var plist;
const path = require("path");
const fs = require("fs");
const {isCordovaAbove} = require("../utils");

const  NSAppTransportSecurity = "NSAppTransportSecurity";
const DIR_SEARCH_EXCEPTION = ["build", "cordova", "CordovaLib"];
const FILE_PACKAGE = "package.json";
const FOLDER_PLATFORMS = "platforms";

function addOrReplaceNSAppTransportSecurityConfig(pListObj,key,value,toReplace) {

    console.log(toReplace)
    if(pListObj[NSAppTransportSecurity] !== undefined){
        if(pListObj[NSAppTransportSecurity][key] !== undefined){
            if(toReplace){
                var newValue = (typeof value === 'object' )? Object.assign({}, value) : JSON.stringify(value);
                pListObj[NSAppTransportSecurity][key] = newValue;
            }else{
                var newValue = (typeof value === 'object' )? Object.assign(pListObj[NSAppTransportSecurity][key], value) : JSON.stringify(value);
                pListObj[NSAppTransportSecurity][key] = newValue;
            }
        }else{
            var newValue = (typeof value === 'object' )? Object.assign({}, value) : JSON.stringify(value);
            pListObj[NSAppTransportSecurity][key] = newValue;
        }
    }else{
        let jsonString = '{"'+key+'":'+JSON.stringify(value)+'}'
        pListObj[NSAppTransportSecurity] = Object.assign({}, JSON.parse(jsonString));
    }

    //Fixes crash on BUPA app. Plist structure is not well created.
    //This is related to the https://github.com/TooTallNate/plist.js/issues/79
    if (pListObj["NSMainNibFile"] == null) {
        pListObj["NSMainNibFile"] = '';
    }
    if (pListObj["NSMainNibFile~ipad"] == null) {
        pListObj["NSMainNibFile~ipad"] = '';
    }

    return pListObj;
}


function compareFileNames(file, filePattern) {
    let fileName = path.basename(file);
    return fileName.indexOf(filePattern) > -1;
}

function searchForPListFile(projectRoot) {
    let foundPListFiles;
    try {
        let packageApplicationContent = fs.readFileSync(path.join(projectRoot, FILE_PACKAGE));
        let packageApplicationJSON = JSON.parse(packageApplicationContent);
        foundPListFiles = searchFilePatternInDirectory(path.join(projectRoot, FOLDER_PLATFORMS, "ios"),[], packageApplicationJSON.name + "-Info.plist", DIR_SEARCH_EXCEPTION,true, compareFileNames);
    }
    catch (e) {
        console.warn("Didnt find package.json and couldn't read name of the application. Will search for other plist files.");
    }
    if (!foundPListFiles || foundPListFiles.length == 0) {
        try {
            foundPListFiles = searchFilePatternInDirectory(path.join(projectRoot, FOLDER_PLATFORMS, "ios"),[], "-Info.plist", DIR_SEARCH_EXCEPTION,true,compareFileNames);
        }
        catch (e) {
        }
    }
    if (foundPListFiles === undefined || foundPListFiles.length == 0) {
        throw new Error("Can't find .plist file in iOS Folder! Try to use plist= custom argument. See documentation for help!");
    }
    else if (foundPListFiles.length > 1) {
        console.warn("Found several -Info.plist files, will take the first one: " + path.resolve(foundPListFiles[0]));
    }
    return foundPListFiles[0];
}
function searchFilePatternInDirectory(searchPath, foundFiles, pattern, filteredDirectories, recursive, fileCompare) {
    var files = fs.readdirSync(searchPath)
    let dirArr = [];
    for (let i = 0; i < files.length; i++) {
        let dirInfo = isDirectory(path.join(searchPath, files[i]));
        if (dirInfo) {
            if (dirInfo.isDirectory) {
                if (!isDirectoryFiltered(dirInfo.path, filteredDirectories) && recursive) {
                    dirArr.push(dirInfo.path);
                }
            }
            else {
                if (fileCompare(dirInfo.path, pattern)) {
                    foundFiles.push(dirInfo.path);
                }
            }
        }
    }
    for (let ii = 0; ii < dirArr.length; ii++) {
        foundFiles = searchFilePatternInDirectory(dirArr[ii], foundFiles, pattern, filteredDirectories, recursive, fileCompare);
    }
    return foundFiles;
}
function isDirectory(checkPath) {
    try {
        let stats = fs.statSync(checkPath);
        return {
            isDirectory: stats.isDirectory(),
            path: checkPath
        };
    }
    catch (e) {
        console.warn("Directory or File could not be read: " + path.resolve(checkPath));
        return undefined;
    }
}
function isDirectoryFiltered(dirPath, filteredDirectories) {
    let dirName = path.basename(dirPath);
    for (let i = 0; i < filteredDirectories.length; i++) {
        if (dirName == filteredDirectories[i]) {
            return true;
        }
    }
    return false;
}
module.exports = function (context) {
    var deferral;
    if(isCordovaAbove(context, 8)){
       plist = require("plist");
       deferral = require('q').defer();
    }else{
       plist = context.requireCordovaModule("plist");
       deferral = context.requireCordovaModule("q").defer();
    }
    var jsonconfig;
    var configPath = path.join(context.opts.projectRoot,"www", "vapt", "config.json");

    console.log("Started PList change!");
    try {
        jsonconfig = fs.readFileSync(configPath, "utf8");
    }
    catch (e) {
        console.warn("Error in configuration File : " + e.message);
    }
    let pathToPList = searchForPListFile(context.opts.projectRoot);
    console.log("Found Plist!");
    jsonObj = JSON.parse(jsonconfig)
    jsonObj = jsonObj.ios;

    var pListContent = fs.readFileSync(pathToPList, "utf8");
    let pListObj = plist.parse(pListContent);

    var firstObj = true;
    for(let j = 0;j<jsonObj.length;j++){
        for(key in jsonObj[j]){
            console.log("Changing "+key+"!");
            var value = jsonObj[j][key];
            var toReplace = !(typeof value === 'object' && value !== null);
            pListObj = addOrReplaceNSAppTransportSecurityConfig(pListObj,key,value,(toReplace || firstObj));
            if(!toReplace){
                firstObj = false;
            }
        }
    }
    console.log("Writing to Plist!");
    fs.writeFileSync(pathToPList, plist.build(pListObj));
    
    console.log("Ended PList change!");

    deferral.resolve();

    return deferral.promise;
    //'{"outsystems.com":{"NSIncludesSubdomains":true,"NSTemporaryExceptionAllowsInsecureHTTPLoads":true,"NSTemporaryExceptionMinimumTLSVersion":"TLSv1.1"}}'
}
