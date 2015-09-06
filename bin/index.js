#! /usr/bin/env node
"use strict";

var Promise = require("promise");
var promisify = require("promisify-node");
var exec = promisify(require("child_process").exec);
var path = require("path");
var fs = require("fs");
var inq = require("inquirer");
var GitHub = require("github");
var licenseText = require("./licenseText");

var moduleName = path.basename(process.cwd());

inq.prompt([{
	type: "input",
	name: "name",
	message: "Package name:",
	"default": moduleName,
	validate: function validate(v) {
		moduleName = v;
		return (/^[a-z0-9][a-z0-9-_.]{1,213}$/.test(v)
		);
	}
}, {
	type: "input",
	name: "version",
	message: "Version:",
	"default": "1.0.0",
	validate: function validate(input) {
		return (/^([0-9]+\.?){1,3}$/.test(input)
		);
	},
	filter: function filter(input) {
		if (input.substr(-1, 1) == ".") {
			input = input.substr(0, input.length - 1);
		}
		input = input.split(".");
		while (input.length < 3) {
			input.push("0");
		}
		input = input.map(function (v) {
			return v == "" ? "0" : v;
		});
		input = input.join(".");

		return input;
	}
}, {
	type: "input",
	name: "description",
	message: "Description:"
}, {
	type: "input",
	name: "authorName",
	message: "Author's name:"
}, {
	type: "input",
	name: "authorEmail",
	message: "Author's email:"
}, {
	type: "list",
	name: "license",
	message: "License:",
	choices: ["ISC", "MIT", "BSD-2-Clause", "BSD-3-Clause", "Public Domain"],
	"default": "ISC"
}, {
	type: "input",
	name: "entry",
	message: "Module entry point:",
	"default": "main.js"
}, {
	type: "input",
	name: "keywords",
	message: "Keywords (comma-separated):",
	filter: function filter(v) {
		return v.split(",").map(function (v) {
			return v.trim();
		});
	}
}, {
	type: "confirm",
	name: "useGit",
	message: "Create a git repo?",
	"default": true
}, {
	type: "confirm",
	name: "useGithub",
	message: "Use GitHub?",
	"default": true,
	when: function when(a) {
		return a.useGit;
	}
}, {
	type: "input",
	name: "repoName",
	message: "Repo name:",
	"default": moduleName,
	when: function when(a) {
		return a.useGithub;
	}
}, {
	type: "input",
	name: "ghUsername",
	message: "GitHub username:",
	when: function when(a) {
		return a.useGithub;
	}
}, {
	type: "password",
	name: "ghPassword",
	message: "GitHub password:",
	when: function when(a) {
		return a.useGithub;
	}
}], function (answers) {
	var pace = require("pace")(answers.useGit ? answers.useGithub ? 8 : 5 : 1);

	var author = answers.authorName;
	if (answers.authorEmail) {
		author += " <" + answers.authorEmail + ">";
	}

	var pkgJson = {
		name: answers.name,
		version: answers.version,
		description: answers.description,
		main: answers.entry,
		keywords: answers.keywords,
		author: author,
		license: answers.license
	};

	new Promise(function (resolve) {
		if (answers.useGit) {
			fs.writeFileSync(".gitignore", "node_modules");
			pace.op();
			exec("git init").then(function () {
				pace.op();
				if (answers.useGithub) {
					return true;
				} else {
					throw null;
				}
			}).then(function () {
				var github = new GitHub({ version: "3.0.0" });
				github.authenticate({
					type: "basic",
					username: answers.ghUsername,
					password: answers.ghPassword
				});

				github.repos.get({ user: answers.ghUsername, repo: answers.repoName }, function (err, repo) {
					if (!repo) {
						github.repos.create({
							name: answers.repoName,
							description: answers.description
						}, function (err, repo) {
							pace.op();
							pkgJson.repository = {
								type: "git",
								url: answers.ghUsername + "/" + answers.repoName
							};
							resolve(repo.ssh_url);
						});
					} else if (repo.created_at == repo.pushed_at) {
						pace.op();
						resolve(repo.ssh_url);
					} else {
						pace.op();

						resolve();
					}
				});
			})["catch"](function () {
				resolve();
			});
		} else {
			resolve();
		}
	}).then(function (gitRepoUrl) {
		pkgJson.blah = "blah";
		licenseText(answers.license, author);
		fs.writeFileSync("package.json", JSON.stringify(pkgJson, null, "  "));
		fs.writeFileSync("LICENSE.md", licenseText(answers.license, author));
		fs.writeFileSync("README.md", "# " + answers.name);
		pace.op();

		if (answers.useGit) {
			exec("git add .").then(function () {
				pace.op();
				return exec("git commit -m \"Initial commit\"");
			}).then(function () {
				pace.op();
				if (gitRepoUrl) {
					return exec("git remote add origin " + gitRepoUrl);
				} else {
					throw null;
				}
			}).then(function () {
				pace.op();
				return exec("git push -u origin master");
			}).then(function () {
				pace.op();
			});
		}
	});
});