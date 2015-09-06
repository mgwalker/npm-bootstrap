#! /usr/bin/env node

const promisify = require("promisify-node");
const exec = promisify(require("child_process").exec);
const path = require("path");
const fs = require("fs");
const inq = require("inquirer");
const GitHub = require("github");
const licenseText = require("./licenseText");

let moduleName = path.basename(process.cwd());

inq.prompt([{
	type: "input",
	name: "name",
	message: "Package name:",
	default: moduleName,
	validate: v => {
		moduleName = v;
		return /^[a-z0-9][a-z0-9-_.]{1,213}$/.test(v);
	}
}, {
	type: "input",
	name: "version",
	message: "Version:",
	default: "1.0.0",
	validate: input => /^([0-9]+\.?){1,3}$/.test(input),
	filter: function(input) {
		if(input.substr(-1, 1) == ".") {
			input = input.substr(0, input.length - 1);
		}
		input = input.split(".");
		while(input.length < 3) {
			input.push("0");
		}
		input = input.map(v => v == "" ? "0" : v);
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
	choices: [
		"ISC",
		"MIT",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"Public Domain"
	],
	default: "ISC"
}, {
	type: "input",
	name: "entry",
	message: "Module entry point:",
	default: "main.js"
}, {
	type: "input",
	name: "keywords",
	message: "Keywords (comma-separated):",
	filter: v => {
		return v.split(",").map(v => v.trim());
	}
}, {
	type: "confirm",
	name: "useGit",
	message: "Create a git repo?",
	default: true
}, {
	type: "confirm",
	name: "useGithub",
	message: "Use GitHub?",
	default: true,
	when: a => a.useGit,
}, {
	type: "input",
	name: "repoName",
	message: "Repo name:",
	default: moduleName,
	when: a => a.useGithub,
}, {
	type: "input",
	name: "ghUsername",
	message: "GitHub username:",
	when: a => a.useGithub
}, {
	type: "password",
	name: "ghPassword",
	message: "GitHub password:",
	when: a => a.useGithub
}], function(answers) {
	let author = answers.authorName;
	if(answers.authorEmail) {
		author += ` <${answers.authorEmail}>`;
	}
	
	const pkgJson = {
		name: answers.name,
		version: answers.version,
		description: answers.description,
		main: answers.entry,
		keywords: answers.keywords,
		author,
		license: answers.license
	};

	fs.writeFileSync("package.json", JSON.stringify(pkgJson, null, "  "));
	fs.writeFileSync("LICENSE.md", licenseText(answers.license, author));
	fs.writeFileSync("README.md", `# ${answers.name}`);
	
	if(answers.useGit) {
		fs.writeFileSync(".gitignore", "node_modules");
		exec("git init")
			.then(function() {
				return exec("git add .");
			})
			.then(function() {
				return exec("git commit -m 'Initial commit'");
			})
			.then(function() {
				if(answers.useGithub) {
					return true;
				} else {
					throw null;
				}
			})
			.then(function() {
				const github = new GitHub({ version: "3.0.0" });
				github.authenticate({
					type: "basic",
					username: answers.ghUsername,
					password: answers.ghPassword
				});
				
				const setGitOriginAndPush = function setGitOriginAndPush(url) {
					exec(`git remote add origin ${url}`)
						.then(function() {
							exec(`git push -u origin master`);
						});
				};
				
				github.repos.get({ user: answers.ghUsername, repo: answers.repoName }, function(err, repo) {
					if(!repo) {
						github.repos.create({
							name: answers.repoName,
							description: answers.description
						}, function(err, repo) {
							setGitOriginAndPush(repo.ssh_url);
						});
					} else if(repo.created_at == repo.pushed_at) {
						setGitOriginAndPush(repo.ssh_url);
					} else {
						console.log(`You already have an active GitHub repo named ${answers.repoName}.`);
					}
				})
			});
	}
});
